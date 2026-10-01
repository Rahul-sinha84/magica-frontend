import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { delay, http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { BACKEND_URL } from "@/lib/config";
import type { ErrorCode } from "@/contracts";
import { useChatStore } from "@/stores/chatStore";
import { addRetryChat, getMockDb } from "../mocks/fixtures";
import { RUN_MS } from "../mocks/handlers";
import { server } from "../mocks/server";
import { realtime } from "../mocks/trigger";
import { renderApp } from "../utils/render";
import { stubLayout } from "../utils/layout";

stubLayout();
afterEach(() => {
  vi.useRealTimers();
  server.events.removeAllListeners();
});

const retryUrl = `${BACKEND_URL}/api/runs/:runId/retry`;
const FAILURE = "The agent couldn't start in time. Please try again.";

async function openFailed() {
  addRetryChat(getMockDb());
  const view = renderApp(<ChatWindow chatId="chat-failed" />);
  await screen.findByText(FAILURE);
  return view;
}

// requests to a path, counted from now on
function count(path: string, method = "GET") {
  const counter = { n: 0 };
  server.events.on("request:start", ({ request }) => {
    if (request.method === method && new URL(request.url).pathname.endsWith(path)) counter.n++;
  });
  return counter;
}

const retryButton = () => screen.getByRole("button", { name: "Retry" });

describe("where Retry shows", () => {
  it("on the reply the backend marks as retryable", async () => {
    await openFailed();
    expect(retryButton()).toBeEnabled();
  });

  it("nowhere else: not on a finished reply", async () => {
    renderApp(<ChatWindow chatId="chat-greeting" />);
    await screen.findByText("Hi! What can I help you with today?");
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("not on a failed reply that is no longer the latest turn", async () => {
    addRetryChat(getMockDb());
    const now = new Date().toISOString();
    getMockDb().messages["chat-failed"].push(
      { id: "m-later-1", chatId: "chat-failed", role: "USER", content: "And now?", contentBlocks: [], status: "COMPLETED", createdAt: now, agentRunId: "run-later" },
      { id: "m-later-2", chatId: "chat-failed", role: "ASSISTANT", content: "Here.", contentBlocks: [{ type: "text", content: "Here." }], status: "COMPLETED", createdAt: now, agentRunId: "run-later" },
    );
    renderApp(<ChatWindow chatId="chat-failed" />);
    await screen.findByText(FAILURE);
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("not while a run is active in the task", async () => {
    await openFailed();
    useChatStore.getState().setRun("chat-failed", {
      runId: "run-x", triggerRunId: null, realtimeToken: null, realtimeTokenExpiresAt: null, startedAt: Date.now(), status: "RUNNING", statusAt: Date.now(),
    });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument());
  });
});

describe("retrying", () => {
  it("calls the endpoint once, even on a fast double click", async () => {
    await openFailed();
    const retries = count("/retry", "POST");
    server.use(http.post(retryUrl, async () => {
      await delay(100);
      return undefined; // on to the mock backend
    }));
    const button = retryButton();
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(useChatStore.getState().runs["chat-failed"]).toBeDefined());
    expect(retries.n).toBe(1);
  });

  it("disables the button while the request is on its way", async () => {
    await openFailed();
    server.use(http.post(retryUrl, async () => {
      await delay(200);
      return undefined;
    }));
    fireEvent.click(retryButton());
    await waitFor(() => expect(retryButton()).toBeDisabled());
    // let it finish inside this test, so its success can't land in the next one
    await waitFor(() => expect(useChatStore.getState().runs["chat-failed"]).toBeDefined());
  });

  it("follows the new run like a send, and streams the new reply below the failed one, which stays", async () => {
    const { user } = await openFailed();
    await user.click(retryButton());

    await waitFor(() => expect(useChatStore.getState().runs["chat-failed"]).toMatchObject({ status: expect.any(String), realtimeToken: "mock-realtime-token" }));
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop response" })).toBeInTheDocument();

    realtime.push({ type: "text-delta", delta: "Second try" });
    const streamed = await screen.findByText("Second try");
    const failure = screen.getByText(FAILURE);
    expect(failure.compareDocumentPosition(streamed) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // the run ends: the saved reply lands below, the failed one is still there, and no Retry is left
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + RUN_MS + 500);
    realtime.setRun({ status: "COMPLETED" });
    await waitFor(() => expect(useChatStore.getState().runs["chat-failed"]).toBeUndefined());
    expect(screen.getByText(FAILURE)).toBeInTheDocument();
    const saved = screen.getByText(/This answer comes from the mock backend/);
    expect(screen.getByText(FAILURE).compareDocumentPosition(saved) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    // no second copy of the question
    expect(screen.getAllByText("Summarise today's news in two lines")).toHaveLength(1);
  });

  it("treats a 200 (already started) exactly like a 201", async () => {
    const { user } = await openFailed();
    const question = getMockDb().messages["chat-failed"][0];
    server.use(
      http.post(retryUrl, () =>
        HttpResponse.json(
          { message: question, chatId: "chat-failed", runId: "run-again", triggerRunId: "t-again", realtimeToken: "tok", realtimeTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString() },
          { status: 200 },
        ),
      ),
    );
    await user.click(retryButton());
    await waitFor(() => expect(useChatStore.getState().runs["chat-failed"]).toMatchObject({ runId: "run-again", triggerRunId: "t-again", status: "PENDING" }));
    expect(screen.queryByText(/Couldn't retry/)).not.toBeInTheDocument();
  });

  it("works from the keyboard, with a focus ring and a tooltip", async () => {
    const { user } = await openFailed();
    const retries = count("/retry", "POST");
    const button = retryButton();
    button.focus();
    expect(button).toHaveFocus();
    expect(button.className).toMatch(/focus-visible:ring-2/);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Retry");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(retries.n).toBe(1));
  });
});

describe("when the retry is turned down", () => {
  const refuse = (status: number, code: ErrorCode, error = "refused") =>
    server.use(http.post(retryUrl, () => HttpResponse.json({ error, code }, { status })));

  it("RUN_NOT_RETRYABLE: says so and reloads the messages", async () => {
    const { user } = await openFailed();
    refuse(409, "RUN_NOT_RETRYABLE");
    const lists = count("/messages");
    await user.click(retryButton());
    expect(await screen.findByText("This reply can't be retried any more.")).toBeInTheDocument();
    await waitFor(() => expect(lists.n).toBeGreaterThanOrEqual(1));
  });

  it("RUN_ACTIVE: says a reply is already being written and looks for the run", async () => {
    const { user } = await openFailed();
    refuse(409, "RUN_ACTIVE");
    const checks = count("/active-run");
    await user.click(retryButton());
    expect(await screen.findByText("A response is already being generated.")).toBeInTheDocument();
    await waitFor(() => expect(checks.n).toBeGreaterThanOrEqual(1));
  });

  for (const [status, code, text] of [
    [402, "INSUFFICIENT_CREDITS", "You don't have enough credits for this."],
    [429, "RATE_LIMITED", "You're sending messages too fast. Wait a moment and try again."],
    [503, "SERVICE_UNAVAILABLE", "The assistant is unavailable right now. Try again shortly."],
  ] as const) {
    it(`${status} ${code}: shows the same reason a send would`, async () => {
      const { user } = await openFailed();
      refuse(status, code);
      await user.click(retryButton());
      expect(await screen.findByText(text)).toBeInTheDocument();
      expect(screen.getByText("Couldn't retry")).toBeInTheDocument();
      // nothing started, so Retry is offered again
      await waitFor(() => expect(retryButton()).toBeEnabled());
    });
  }

  it("404: says it's gone and reloads the messages", async () => {
    const { user } = await openFailed();
    refuse(404, "NOT_FOUND", "Run not found");
    const lists = count("/messages");
    await user.click(retryButton());
    expect(await screen.findByText("This reply or task no longer exists.")).toBeInTheDocument();
    await waitFor(() => expect(lists.n).toBeGreaterThanOrEqual(1));
  });

  it("401: leaves it to the app-wide session handling (no retry toast)", async () => {
    const { user } = await openFailed();
    refuse(401, "UNAUTHORIZED", "Unauthorized");
    await user.click(retryButton());
    await waitFor(() => expect(retryButton()).toBeEnabled());
    expect(screen.queryByText("Couldn't retry")).not.toBeInTheDocument();
  });

  it("leaves the failed reply exactly as it was", async () => {
    const { user } = await openFailed();
    refuse(409, "RUN_NOT_RETRYABLE");
    await user.click(retryButton());
    await screen.findByText("This reply can't be retried any more.");
    const failure = screen.getByText(FAILURE);
    expect(within(failure.closest("div")!).getByText(FAILURE)).toHaveAttribute("role", "alert");
  });
});

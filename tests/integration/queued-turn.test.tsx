import { act, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { BACKEND_URL } from "@/lib/config";
import { useChatStore } from "@/stores/chatStore";
import { getMockDb } from "../mocks/fixtures";
import { server } from "../mocks/server";
import { realtime } from "../mocks/trigger";
import { renderApp } from "../utils/render";
import { stubLayout } from "../utils/layout";

stubLayout();
afterEach(() => {
  vi.useRealTimers();
  server.events.removeAllListeners();
});

const NOTICE = "Lots of people are using the assistant right now. Your message is queued and will start shortly.";
const activeRunUrl = `${BACKEND_URL}/api/chats/:chatId/active-run`;
const HOUR = 3_600_000;

// The server says this chat's turn is waiting in the queue (or, with `status`, that it started).
function queuedRun({ token = "tok" as string | null, status = "PENDING" } = {}) {
  const now = new Date().toISOString();
  const run = { id: "run-q", chatId: "chat-greeting", triggerRunId: "t-q", status, startedAt: null, completedAt: null };
  getMockDb().runs["chat-greeting"] = { ...run, status: "RUNNING", startedAt: now };
  server.use(
    http.get(activeRunUrl, () =>
      HttpResponse.json({
        run,
        realtimeToken: token,
        realtimeTokenExpiresAt: token ? new Date(Date.now() + HOUR).toISOString() : null,
        partialText: null,
        partialBlocks: [],
      }),
    ),
  );
  return run;
}

function countChecks() {
  const counter = { n: 0 };
  server.events.on("request:start", ({ request }) => {
    if (request.url.endsWith("/active-run")) counter.n++;
  });
  return counter;
}

const openChat = () => renderApp(<ChatWindow chatId="chat-greeting" />);

describe("a turn waiting in the queue", () => {
  it("shows the typing indicator, then after 10 seconds says it's queued", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    queuedRun();
    openChat();
    expect(await screen.findByRole("status", { name: "The assistant is thinking" })).toBeInTheDocument();
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(9_000));
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(1_500));
    expect(screen.getByText(NOTICE)).toHaveAttribute("role", "status");
    expect(screen.getByRole("status", { name: "The assistant is thinking" })).toBeInTheDocument();
  });

  it("knows it is waiting from Trigger.dev too, even when our server already says it started", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    queuedRun({ status: "RUNNING" });
    realtime.setRun({ status: "QUEUED" });
    openChat();
    await screen.findByRole("status", { name: "The assistant is thinking" });
    await act(() => vi.advanceTimersByTimeAsync(10_500));
    expect(screen.getByText(NOTICE)).toBeInTheDocument();
  });

  it("drops the note once something is written", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    queuedRun();
    openChat();
    await screen.findByRole("status", { name: "The assistant is thinking" });
    await act(() => vi.advanceTimersByTimeAsync(10_500));
    expect(screen.getByText(NOTICE)).toBeInTheDocument();
    act(() => realtime.push({ type: "text-delta", delta: "Started!" }));
    expect(await screen.findByText("Started!")).toBeInTheDocument();
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  it("can be stopped while waiting", async () => {
    queuedRun();
    const cancels: string[] = [];
    server.use(
      http.post(`${BACKEND_URL}/api/runs/:runId/cancel`, ({ params }) => {
        cancels.push(params.runId as string);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = openChat();
    await user.click(await screen.findByRole("button", { name: "Stop response" }));
    await waitFor(() => expect(cancels).toEqual(["run-q"]));
  });
});

describe("the run's status", () => {
  it("moves from PENDING to RUNNING when the server says so", async () => {
    let status = "PENDING";
    queuedRun();
    server.use(
      http.get(activeRunUrl, () =>
        HttpResponse.json({
          run: { id: "run-q", chatId: "chat-greeting", triggerRunId: "t-q", status, startedAt: null, completedAt: null },
          realtimeToken: null,
          realtimeTokenExpiresAt: null,
          partialText: null,
          partialBlocks: [],
        }),
      ),
    );
    openChat();
    await waitFor(() => expect(useChatStore.getState().runs["chat-greeting"]?.status).toBe("PENDING"));
    status = "RUNNING";
    await waitFor(() => expect(useChatStore.getState().runs["chat-greeting"]?.status).toBe("RUNNING"), { timeout: 4000 });
  });

  it("isn't moved back by an answer older than the last change", async () => {
    queuedRun(); // the server keeps answering PENDING
    // this tab already heard RUNNING, from an answer "newer" than any that will arrive
    useChatStore.getState().setRun("chat-greeting", {
      runId: "run-q", triggerRunId: "t-q", realtimeToken: "tok", realtimeTokenExpiresAt: new Date(Date.now() + HOUR).toISOString(),
      startedAt: Date.now(), status: "RUNNING", statusAt: Date.now() + HOUR,
    });
    openChat();
    await screen.findByRole("button", { name: "Stop response" });
    await new Promise((r) => setTimeout(r, 200));
    expect(useChatStore.getState().runs["chat-greeting"]?.status).toBe("RUNNING");
  });

  it("starts as PENDING right after a send", async () => {
    const { user } = openChat();
    await screen.findByText("Hi! What can I help you with today?");
    const box = screen.getByPlaceholderText("Send a message…");
    await user.type(box, "hello");
    await waitFor(() => expect(box).toHaveValue("hello"));
    // hold the next check so nothing can update the status yet
    server.use(http.get(activeRunUrl, () => new Promise(() => {})));
    await user.keyboard("{Enter}");
    await waitFor(() => expect(useChatStore.getState().runs["chat-greeting"]?.status).toBe("PENDING"));
  });
});

describe("how often a queued turn is checked", () => {
  it("every 10s while the realtime subscription is healthy, even before any chunk", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    queuedRun();
    realtime.setRun({ status: "QUEUED" }); // Trigger.dev answered: the subscription works
    openChat();
    await screen.findByRole("button", { name: "Stop response" });
    await waitFor(() => expect(realtime.subscriptions.length).toBeGreaterThan(0));
    const checks = countChecks();
    await act(() => vi.advanceTimersByTimeAsync(20_500));
    expect(checks.n).toBeGreaterThanOrEqual(1);
    expect(checks.n).toBeLessThanOrEqual(3);
  });

  it("every 2s when there is no token", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    queuedRun({ token: null });
    openChat();
    await screen.findByRole("button", { name: "Stop response" });
    const checks = countChecks();
    await act(() => vi.advanceTimersByTimeAsync(20_500));
    expect(checks.n).toBeGreaterThanOrEqual(8);
  });

  it("every 2s after the realtime subscription fails", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    queuedRun();
    realtime.setRun({ status: "QUEUED" });
    openChat();
    await screen.findByRole("button", { name: "Stop response" });
    act(() => realtime.failStream());
    const checks = countChecks();
    await act(() => vi.advanceTimersByTimeAsync(20_500));
    expect(checks.n).toBeGreaterThanOrEqual(8);
  });
});

describe("a turn nobody started in time", () => {
  it("shows the backend's reason when the reply ends FAILED", async () => {
    queuedRun();
    openChat();
    await screen.findByRole("button", { name: "Stop response" });
    const db = getMockDb();
    db.messages["chat-greeting"].push({
      id: "m-timeout", chatId: "chat-greeting", role: "ASSISTANT", content: "", contentBlocks: [], status: "FAILED",
      createdAt: new Date().toISOString(), agentRunId: "run-q", errorMessage: "The agent couldn't start in time. Please try again.",
    });
    server.use(
      http.get(activeRunUrl, () => HttpResponse.json({ run: null, realtimeToken: null, realtimeTokenExpiresAt: null, partialText: null, partialBlocks: [] })),
    );
    expect(await screen.findByText("The agent couldn't start in time. Please try again.", {}, { timeout: 4000 })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Stop response" })).not.toBeInTheDocument());
  });
});

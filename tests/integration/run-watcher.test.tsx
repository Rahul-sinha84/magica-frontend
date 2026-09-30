import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse, delay } from "msw";
import { BACKEND_URL } from "@/lib/config";
import { server } from "../mocks/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { useChatStore } from "@/stores/chatStore";
import { getMockDb } from "../mocks/fixtures";
import { RUN_MS } from "../mocks/handlers";
import { renderApp, typeAndSend } from "../utils/render";
import { stubLayout } from "../utils/layout";

// poll fast, so the tests don't wait two seconds per round
vi.mock("@/lib/timing", async (original) => ({ ...(await original<typeof import("@/lib/timing")>()), RUN_POLL_MS: 40 }));
stubLayout();

afterEach(() => vi.useRealTimers());

const box = () => screen.getByPlaceholderText("Send a message…");

describe("waiting for a reply", () => {
  it("loads the reply when the run finishes, and gives the composer back", async () => {
    const { user } = renderApp(<ChatWindow chatId="chat-greeting" />);
    await screen.findByText("Hi! What can I help you with today?");
    await typeAndSend(user, box(), "hello again");
    await screen.findByRole("status", { name: "The assistant is thinking" });

    // the run takes RUN_MS on the mock's clock; move the clock instead of waiting
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + RUN_MS + 500);

    expect(await screen.findByText(/This answer comes from the mock backend/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("status", { name: "The assistant is thinking" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled(); // empty box, but it is Send again
    expect(useChatStore.getState().runs["chat-greeting"]).toBeUndefined();
  });

  it("picks up a run that is already going when the page opens", async () => {
    const now = new Date().toISOString();
    getMockDb().runs["chat-greeting"] = { id: "run-x", chatId: "chat-greeting", triggerRunId: "t-x", status: "RUNNING", startedAt: now, completedAt: null };
    renderApp(<ChatWindow chatId="chat-greeting" />);
    expect(await screen.findByRole("button", { name: "Stop response" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "The assistant is thinking" })).toBeInTheDocument();
  });

  it("does not show another task's run", async () => {
    const now = new Date().toISOString();
    getMockDb().runs["chat-apple"] = { id: "run-y", chatId: "chat-apple", triggerRunId: "t-y", status: "RUNNING", startedAt: now, completedAt: null };
    renderApp(<ChatWindow chatId="chat-greeting" />);
    await screen.findByText("Hi! What can I help you with today?");
    expect(screen.queryByRole("button", { name: "Stop response" })).not.toBeInTheDocument();
  });

  it("stops waiting when the task turns out to be gone", async () => {
    const now = new Date().toISOString();
    getMockDb().runs["chat-greeting"] = { id: "run-z", chatId: "chat-greeting", triggerRunId: "t-z", status: "RUNNING", startedAt: now, completedAt: null };
    renderApp(<ChatWindow chatId="chat-greeting" />);
    await screen.findByRole("button", { name: "Stop response" });
    getMockDb().chats = getMockDb().chats.filter((c) => c.id !== "chat-greeting");
    await waitFor(() => expect(useChatStore.getState().runs["chat-greeting"]).toBeUndefined());
  });
});

// Reports from the backend: Stop sometimes did nothing and no cancel request arrived.
describe("the Stop button always sends the cancel request", () => {
  const cancelUrl = `${BACKEND_URL}/api/runs/:runId/cancel`;
  const watchCancels = () => {
    const ids: string[] = [];
    server.use(
      http.post(cancelUrl, ({ params }) => {
        ids.push(params.runId as string);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    return ids;
  };

  it("after a normal send", async () => {
    const ids = watchCancels();
    const { user } = renderApp(<ChatWindow chatId="chat-greeting" />);
    await screen.findByText("Hi! What can I help you with today?");
    await typeAndSend(user, box(), "go");
    await user.click(await screen.findByRole("button", { name: "Stop response" }));
    await waitFor(() => expect(ids).toHaveLength(1));
    expect(ids[0]).toBe(useChatStore.getState().runs["chat-greeting"]?.runId ?? ids[0]);
  });

  it("while the send is still in flight: the cancel goes out as soon as the run is known", async () => {
    const ids = watchCancels();
    server.use(
      http.post(`${BACKEND_URL}/api/chats/:chatId/messages`, async () => {
        await delay(250);
        return undefined;
      }),
    );
    const { user } = renderApp(<ChatWindow chatId="chat-greeting" />);
    await screen.findByText("Hi! What can I help you with today?");
    await typeAndSend(user, box(), "slow one");
    // the run doesn't exist yet, but the button is already Stop and can be pressed
    await user.click(await screen.findByRole("button", { name: "Stop response" }));
    expect(ids).toHaveLength(0);
    await waitFor(() => expect(ids).toHaveLength(1), { timeout: 3000 });
    expect(useChatStore.getState().stopRequested["chat-greeting"]).toBeUndefined();
  });

  it("after a reload in the middle of a run (the run is restored from the server)", async () => {
    const ids = watchCancels();
    const now = new Date().toISOString();
    getMockDb().runs["chat-greeting"] = { id: "run-r", chatId: "chat-greeting", triggerRunId: "t-r", status: "RUNNING", startedAt: now, completedAt: null };
    const { user } = renderApp(<ChatWindow chatId="chat-greeting" />);
    await user.click(await screen.findByRole("button", { name: "Stop response" }));
    await waitFor(() => expect(ids).toEqual(["run-r"]));
  });

  it("shows Stopping at once, and offers Stop again if the cancel didn't go through", async () => {
    const now = new Date().toISOString();
    getMockDb().runs["chat-greeting"] = { id: "run-r", chatId: "chat-greeting", triggerRunId: "t-r", status: "RUNNING", startedAt: now, completedAt: null };
    let calls = 0;
    server.use(
      http.post(cancelUrl, async () => {
        calls++;
        await delay(100);
        return calls === 1 ? HttpResponse.json({ error: "down", code: "INTERNAL_ERROR" }, { status: 500 }) : new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = renderApp(<ChatWindow chatId="chat-greeting" />);
    await user.click(await screen.findByRole("button", { name: "Stop response" }));
    expect(await screen.findByRole("button", { name: "Stopping" })).toBeDisabled();
    expect(await screen.findByText("Couldn't stop the response")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Stop response" }));
    await waitFor(() => expect(calls).toBe(2));
  });

  it("does not show Stop for a message that failed to send", async () => {
    server.use(http.post(`${BACKEND_URL}/api/chats/:chatId/messages`, () => HttpResponse.json({ error: "x", code: "INTERNAL_ERROR" }, { status: 500 })));
    const { user } = renderApp(<ChatWindow chatId="chat-greeting" />);
    await screen.findByText("Hi! What can I help you with today?");
    await typeAndSend(user, box(), "will fail");
    await waitFor(() => expect(box()).toHaveValue("will fail"));
    expect(screen.queryByRole("button", { name: "Stop response" })).not.toBeInTheDocument();
    expect(useChatStore.getState().stopRequested["chat-greeting"]).toBeUndefined();
  });
});

describe("the run in the store", () => {
  it("keeps the realtime token from the send response", async () => {
    const { user } = renderApp(<ChatWindow chatId="chat-greeting" />);
    await screen.findByText("Hi! What can I help you with today?");
    await typeAndSend(user, box(), "hello");
    await waitFor(() => expect(useChatStore.getState().runs["chat-greeting"]?.realtimeToken).toBe("mock-realtime-token"));
    expect(useChatStore.getState().runs["chat-greeting"]?.realtimeTokenExpiresAt).toEqual(expect.any(String));
  });

  it("keeps the token from the active-run answer when a run is restored", async () => {
    const now = new Date().toISOString();
    getMockDb().runs["chat-greeting"] = { id: "run-t", chatId: "chat-greeting", triggerRunId: "t-t", status: "RUNNING", startedAt: now, completedAt: null };
    renderApp(<ChatWindow chatId="chat-greeting" />);
    await waitFor(() => expect(useChatStore.getState().runs["chat-greeting"]?.realtimeToken).toBe("mock-realtime-token"));
  });

  it("copes with no token at all", async () => {
    const now = new Date().toISOString();
    getMockDb().runs["chat-greeting"] = { id: "run-n", chatId: "chat-greeting", triggerRunId: "t-n", status: "RUNNING", startedAt: now, completedAt: null };
    server.use(
      http.get(`${BACKEND_URL}/api/chats/:chatId/active-run`, () =>
        HttpResponse.json({ run: getMockDb().runs["chat-greeting"], realtimeToken: null, realtimeTokenExpiresAt: null, partialText: null, partialBlocks: [] }),
      ),
    );
    renderApp(<ChatWindow chatId="chat-greeting" />);
    await waitFor(() => expect(useChatStore.getState().runs["chat-greeting"]).toMatchObject({ realtimeToken: null, realtimeTokenExpiresAt: null }));
  });
});

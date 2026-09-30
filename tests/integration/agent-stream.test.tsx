import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { BACKEND_URL } from "@/lib/config";
import { useChatStore } from "@/stores/chatStore";
import { getMockDb } from "../mocks/fixtures";
import { RUN_MS } from "../mocks/handlers";
import { server } from "../mocks/server";
import { realtime } from "../mocks/trigger";
import { renderApp, typeAndSend } from "../utils/render";
import { stubLayout } from "../utils/layout";

// Without a live stream, runs are checked every 40ms. With one, practically never, so a test can tell
// which mode the page is in by counting checks.
vi.mock("@/lib/timing", async (original) => ({
  ...(await original<typeof import("@/lib/timing")>()),
  RUN_POLL_MS: 40,
  LIVE_POLL_MS: 60_000,
  REALTIME_RETRY_MS: 150,
}));
stubLayout();
afterEach(() => vi.useRealTimers());

const box = () => screen.getByPlaceholderText("Send a message…");
const activeRunUrl = `${BACKEND_URL}/api/chats/:chatId/active-run`;

function countChecks() {
  const counter = { n: 0 };
  server.events.on("request:start", ({ request }) => {
    if (request.url.endsWith("/active-run")) counter.n++;
  });
  return counter;
}

async function startRun() {
  const view = renderApp(<ChatWindow chatId="chat-greeting" />);
  await screen.findByText("Hi! What can I help you with today?");
  await typeAndSend(view.user, box(), "tell me something");
  await waitFor(() => expect(realtime.subscriptions.length).toBeGreaterThan(0));
  return view;
}

afterEach(() => server.events.removeAllListeners());

describe("live streaming", () => {
  it("subscribes to the run with the token from the send", async () => {
    await startRun();
    const run = useChatStore.getState().runs["chat-greeting"]!;
    expect(realtime.subscriptions.at(-1)).toMatchObject({ runId: run.triggerRunId, accessToken: "mock-realtime-token" });
  });

  it("shows Thinking, then the steps and text as chunks arrive", async () => {
    await startRun();
    expect(screen.getByRole("status", { name: "The assistant is thinking" })).toBeInTheDocument();

    realtime.setRun({ status: "EXECUTING", metadata: { status: "calling-tool" } });
    realtime.push({ type: "tool-start", toolCallId: "t1", toolName: "skill", toolInput: { name: "research" } });
    expect(await screen.findByRole("button", { name: /Working · 1 step/ })).toBeInTheDocument();

    realtime.push({ type: "tool-end", toolCallId: "t1", status: "completed", durationMs: 800 }, { type: "text-delta", delta: "The answer " });
    realtime.setRun({ status: "EXECUTING", metadata: { status: "streaming" } });
    expect(await screen.findByText("The answer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Completed 1 step/ })).toBeInTheDocument();

    realtime.push({ type: "text-delta", delta: "is 42." });
    expect(await screen.findByText("The answer is 42.")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "The assistant is thinking" })).not.toBeInTheDocument();
  });

  it("drops chunks that don't match the contract", async () => {
    await startRun();
    realtime.push({ type: "text-delta", delta: "kept" }, { type: "mystery", payload: 1 }, { type: "text-delta" });
    expect(await screen.findByText("kept")).toBeInTheDocument();
  });

  it("gets how long it thought from the run's metadata (there is no 'thinking ended' chunk)", async () => {
    await startRun();
    realtime.push({ type: "thinking-delta", delta: "Let me see" });
    realtime.setRun({ status: "EXECUTING", metadata: { status: "thinking" } });
    await screen.findByRole("button", { name: "Thinking" });
    realtime.setRun({ status: "EXECUTING", metadata: { status: "streaming", thinkingDurationMs: 2300 } });
    realtime.push({ type: "text-delta", delta: "Here goes" });
    expect(await screen.findByRole("button", { name: /Thought for 2.3s/ })).toBeInTheDocument();
  });

  it("checks the server rarely while the stream is working", async () => {
    await startRun();
    realtime.push({ type: "text-delta", delta: "streaming" });
    await screen.findByText("streaming");
    const checks = countChecks();
    await new Promise((r) => setTimeout(r, 300));
    expect(checks.n).toBeLessThanOrEqual(1);
  });

  it("does not end the run just because Trigger.dev says it finished: the server decides", async () => {
    await startRun();
    realtime.push({ type: "text-delta", delta: "partial" });
    realtime.setRun({ status: "COMPLETED", metadata: { status: "complete" } });
    // the server still says RUNNING (its clock hasn't reached the end)
    await new Promise((r) => setTimeout(r, 200));
    expect(useChatStore.getState().runs["chat-greeting"]).toBeDefined();
    expect(screen.getByRole("button", { name: "Stop response" })).toBeInTheDocument();
  });

  it("asks the server right away when Trigger.dev says the run finished", async () => {
    await startRun();
    realtime.push({ type: "text-delta", delta: "streaming" });
    await screen.findByText("streaming");
    const checks = countChecks();
    realtime.setRun({ status: "COMPLETED", metadata: { status: "complete" } });
    await waitFor(() => expect(checks.n).toBeGreaterThanOrEqual(1));
  });

  it("replaces the streaming reply with the saved one, with no gap", async () => {
    await startRun();
    realtime.push({ type: "text-delta", delta: "Sure! This answer" });
    await screen.findByText("Sure! This answer");

    // watch for any moment where neither the streamed nor the saved reply is on screen
    let gap = false;
    const observer = new MutationObserver(() => {
      if (!document.body.textContent?.includes("Sure! This answer")) gap = true;
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + RUN_MS + 500);
    realtime.setRun({ status: "COMPLETED", metadata: { status: "complete" } });

    await waitFor(() => expect(useChatStore.getState().runs["chat-greeting"]).toBeUndefined());
    observer.disconnect();
    expect(gap).toBe(false);
    expect(screen.getByText(/This answer comes from the mock backend/)).toBeInTheDocument();
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
  });
});

describe("when the live stream fails", () => {
  it("falls back to checking every couple of seconds and shows the server's saved progress", async () => {
    await startRun();
    realtime.failStream();
    const checks = countChecks();
    // the mock's saved progress: a thinking block and a running step after 30% of the run
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + RUN_MS * 0.3);
    expect(await screen.findByRole("button", { name: /Working · 1 step/ })).toBeInTheDocument();
    await waitFor(() => expect(checks.n).toBeGreaterThanOrEqual(3));
  });

  it("uses the server's copy when it is further along than the stream", async () => {
    let saved = false;
    server.use(
      http.get(activeRunUrl, () =>
        HttpResponse.json({
          run: Object.values(getMockDb().runs)[0] ?? null,
          realtimeToken: "mock-realtime-token",
          realtimeTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          partialText: saved ? "Saved so far" : null,
          partialBlocks: saved ? [{ type: "text", content: "Saved so far" }] : [],
        }),
      ),
    );
    await startRun();
    realtime.push({ type: "text-delta", delta: "Saved so" });
    await screen.findByText("Saved so");
    saved = true;
    realtime.failStream();
    expect(await screen.findByText("Saved so far")).toBeInTheDocument();
  });

  it("tries the live stream again later", async () => {
    await startRun();
    const before = realtime.subscriptions.length;
    realtime.failStream();
    await waitFor(() => expect(realtime.subscriptions.length).toBeGreaterThan(before), { timeout: 1000 });
  });

  it("follows the run by polling when there is no token at all", async () => {
    const now = new Date().toISOString();
    getMockDb().runs["chat-greeting"] = { id: "run-n", chatId: "chat-greeting", triggerRunId: "t-n", status: "RUNNING", startedAt: now, completedAt: null };
    server.use(
      http.get(activeRunUrl, () =>
        HttpResponse.json({ run: getMockDb().runs["chat-greeting"], realtimeToken: null, realtimeTokenExpiresAt: null, partialText: "polled", partialBlocks: [] }),
      ),
    );
    renderApp(<ChatWindow chatId="chat-greeting" />);
    expect(await screen.findByText("polled")).toBeInTheDocument();
    expect(realtime.subscriptions).toHaveLength(0);
  });
});

describe("how a run ends", () => {
  it("a failed run keeps its partial text and says why", async () => {
    await startRun();
    realtime.push({ type: "text-delta", delta: "Half an ans" });
    await screen.findByText("Half an ans");
    const db = getMockDb();
    const run = db.runs["chat-greeting"];
    run.status = "FAILED";
    db.messages["chat-greeting"].push({
      id: "m-failed", chatId: "chat-greeting", role: "ASSISTANT", content: "Half an ans", contentBlocks: [{ type: "text", content: "Half an ans" }],
      status: "FAILED", createdAt: new Date().toISOString(), agentRunId: run.id, errorMessage: "The model stopped responding.",
    });
    realtime.setRun({ status: "FAILED" });
    expect(await screen.findByText("The model stopped responding.")).toBeInTheDocument();
    expect(screen.getByText("Half an ans")).toBeInTheDocument();
  });

  it("a stopped run keeps its partial reply and is marked stopped", async () => {
    const { user } = await startRun();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + RUN_MS * 0.8);
    await user.click(screen.getByRole("button", { name: "Stop response" }));
    expect(await screen.findByText("Stopped")).toBeInTheDocument();
    expect(screen.getByText(/^Sure! This answer/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send message" })).toBeInTheDocument();
  });

  it("shows Stopping while the backend winds the run down", async () => {
    await startRun();
    realtime.setRun({ status: "EXECUTING", metadata: { status: "stopping" } });
    expect(await screen.findByText("Stopping…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stopping" })).toBeDisabled();
  });
});

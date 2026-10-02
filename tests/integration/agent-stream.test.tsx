import { screen, waitFor, within } from "@testing-library/react";
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

    realtime.setRun({ status: "EXECUTING", metadata: { status: "working", currentTool: { name: "skill", input: { name: "research" }, status: "running" } } });
    realtime.push({ type: "tool-start", toolCallId: "t1", toolName: "skill", toolInput: { name: "research" } });
    expect(await screen.findByRole("button", { name: /Working · 1 step/ })).toBeInTheDocument();

    realtime.push({ type: "tool-end", toolCallId: "t1", status: "completed", durationMs: 800 }, { type: "text-delta", delta: "The answer " });
    realtime.setRun({ status: "EXECUTING", metadata: { status: "working" } });
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

  it("shows magica's '⌄ Thinking' row while the model thinks, with its reasoning when opened, then drops it", async () => {
    const { user } = await startRun();
    realtime.push({ type: "thinking-delta", delta: "Let me see" });
    realtime.setRun({ status: "EXECUTING", metadata: { status: "thinking" } });
    const row = await screen.findByRole("status", { name: "The assistant is thinking" });
    await user.click(within(row).getByRole("button", { name: "Thinking" }));
    expect(screen.getByText("Let me see")).toBeInTheDocument();
    realtime.setRun({ status: "EXECUTING", metadata: { status: "working", thinkingDurationMs: 2300 } });
    realtime.push({ type: "text-delta", delta: "Here goes" });
    expect(await screen.findByText("Here goes")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "The assistant is thinking" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Thought for/)).not.toBeInTheDocument();
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
    expect(await screen.findByText("Response was interrupted")).toBeInTheDocument();
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

describe("the worker's own status", () => {
  it("'cancelled' makes the page ask the server at once, but only the server ends the run", async () => {
    await startRun();
    realtime.push({ type: "text-delta", delta: "partial" });
    await screen.findByText("partial");
    const checks = countChecks();
    realtime.setRun({ status: "EXECUTING", metadata: { status: "cancelled" } });
    await waitFor(() => expect(checks.n).toBeGreaterThanOrEqual(1));
    // the server still says the run is going, so it stays
    await new Promise((r) => setTimeout(r, 150));
    expect(useChatStore.getState().runs["chat-greeting"]).toBeDefined();
    expect(screen.getByText("partial")).toBeInTheDocument();
  });

  it("'complete' and 'failed' also make it ask at once", async () => {
    for (const status of ["complete", "failed"]) {
      realtime.reset();
      const view = await startRun();
      realtime.push({ type: "text-delta", delta: "x" });
      const checks = countChecks();
      realtime.setRun({ status: "EXECUTING", metadata: { status } });
      await waitFor(() => expect(checks.n).toBeGreaterThanOrEqual(1));
      server.events.removeAllListeners();
      view.unmount();
      useChatStore.setState(useChatStore.getInitialState(), true);
      getMockDb().runs = {};
    }
  });

  it("shows Stopping when the worker says so, even if the stop came from elsewhere", async () => {
    await startRun();
    realtime.push({ type: "text-delta", delta: "going" });
    await screen.findByText("going");
    realtime.setRun({ status: "EXECUTING", metadata: { status: "stopping" } });
    expect(await screen.findByText("Stopping…")).toBeInTheDocument();
    expect(useChatStore.getState().stopping["chat-greeting"]).toBeUndefined();
  });

  it("shows tool activity from currentTool while 'working'", async () => {
    await startRun();
    realtime.setRun({ status: "EXECUTING", metadata: { status: "working", currentTool: { name: "skill", input: { name: "research" }, status: "running" } } });
    realtime.push({ type: "tool-start", toolCallId: "t1", toolName: "skill", toolInput: { name: "research" } });
    expect(await screen.findByRole("button", { name: /Working · 1 step/ })).toBeInTheDocument();
  });

  it("keeps a generated clip inline instead of opening the side panel", async () => {
    await startRun();
    realtime.push({ type: "asset", asset: { type: "audio", url: "/mock/chime.wav", altText: "A chime" } });
    expect(await screen.findByLabelText("A chime")).toBeInTheDocument();
    expect(useChatStore.getState().artifactPanel.isOpen).toBe(false);
  });
});

describe("the real tools while a reply is written", () => {
  it("shows the running step with a spinner on its own row (no separate 'Running …' line), then a check", async () => {
    const { user } = await startRun();
    realtime.push({ type: "tool-start", toolCallId: "s1-AbC123xyz", toolName: "gpt_image_2", toolInput: { mode: "text", prompt: "a cat" } });
    realtime.setRun({ status: "EXECUTING", metadata: { status: "working", currentTool: { name: "gpt_image_2", input: { prompt: "a cat" }, status: "running" } } });
    expect(await screen.findByRole("button", { name: /Working · 1 step/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Running" })).toBeInTheDocument();
    expect(screen.queryByText(/^Running /)).not.toBeInTheDocument();

    realtime.push({ type: "tool-end", toolCallId: "s1-AbC123xyz", status: "completed", durationMs: 30_000, creditCost: 70_000, result: { url: "https://cdn.example.com/cat.png", width: 1024, height: 1024 } });
    realtime.setRun({ status: "EXECUTING", metadata: { status: "working" } });
    // the step is done but the agent may take another: the list stays open, and the step shows its check
    expect(await screen.findByRole("img", { name: "Done" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Working · 1 step/ })).toHaveAttribute("aria-expanded", "true");

    // once it moves on to writing, the list folds away, as on magica; opened, the step is still there
    realtime.push({ type: "text-delta", delta: "Here is your cat." });
    const header = await screen.findByRole("button", { name: /Completed 1 step/ });
    expect(header).toHaveAttribute("aria-expanded", "false");
    await user.click(header);
    expect(screen.getByRole("img", { name: "Done" })).toBeInTheDocument();
  });

  it("names unknown tools readably", async () => {
    await startRun();
    realtime.push({ type: "tool-start", toolCallId: "s1-up", toolName: "upscale_video", toolInput: { factor: 2 } });
    expect(await screen.findByText("Upscale video")).toBeInTheDocument();
  });

  it("a turn stopped mid-tool keeps that tool, shown as Failed with 'Stopped.'", async () => {
    const view = renderApp(<ChatWindow chatId="chat-greeting" />);
    await screen.findByText("Hi! What can I help you with today?");
    await typeAndSend(view.user, box(), "draw an image of a cat");
    await waitFor(() => expect(useChatStore.getState().runs["chat-greeting"]).toBeDefined());
    realtime.failStream(); // follow the mock's saved progress
    // the image step is running (the mock runs it from 35% to 55% of the turn)
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + RUN_MS * 0.45);
    await view.user.click(await screen.findByRole("button", { name: "Stop response" }));
    expect(await screen.findByText("Response was interrupted")).toBeInTheDocument();

    const saved = getMockDb().messages["chat-greeting"].at(-1)!;
    const step = saved.contentBlocks.find((b) => b.type === "tool_call" && b.toolName === "gpt_image_2");
    expect(step).toMatchObject({ status: "failed" });
    expect(saved.contentBlocks).toContainEqual(expect.objectContaining({ type: "tool_result", isError: true, errorMessage: "Stopped." }));

    await view.user.click(screen.getByRole("button", { name: /Completed 2 steps/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("Stopped.");
  });
});

describe("mock mode looks like the real tools", () => {
  it("a merge streams a video and ends with no text", async () => {
    const { mockRunBlocks } = await import("../mocks/handlers");
    const blocks = mockRunBlocks(1, { merge: true });
    expect(blocks.filter((b) => b.type === "tool_call").map((b) => b.type === "tool_call" && b.toolName)).toEqual(["load_skill", "merge_videos"]);
    expect(blocks).toContainEqual(expect.objectContaining({ type: "video", model: "Merge Videos" }));
    expect(blocks.some((b) => b.type === "text")).toBe(false);
  });

  it("a failing step has isError and a safe message, and makes no asset", async () => {
    const { mockRunBlocks, MOCK_TOOL_ERROR } = await import("../mocks/handlers");
    const blocks = mockRunBlocks(1, { image: true, fail: true });
    expect(blocks).toContainEqual(expect.objectContaining({ type: "tool_call", toolName: "gpt_image_2", status: "failed" }));
    expect(blocks).toContainEqual(expect.objectContaining({ type: "tool_result", isError: true, errorMessage: MOCK_TOOL_ERROR }));
    expect(blocks.some((b) => b.type === "image")).toBe(false);
  });

  it("an image request runs gpt_image_2 with the backend's result shape and streams the asset", async () => {
    const { mockRunBlocks } = await import("../mocks/handlers");
    const blocks = mockRunBlocks(1, { image: true });
    expect(blocks).toContainEqual(
      expect.objectContaining({ type: "tool_result", toolName: "gpt_image_2", result: expect.objectContaining({ url: expect.any(String), width: 1024, height: 1024, mimeType: expect.any(String) }) }),
    );
    expect(blocks).toContainEqual(expect.objectContaining({ type: "image", model: "GPT Image 2" }));
  });
});

describe("a real tool turn, as the backend streams it", () => {
  it("shows one steps group across the model's rounds, and no thinking row once there are steps", async () => {
    await startRun();
    realtime.push(
      { type: "thinking-delta", delta: "Need the skill." },
      { type: "tool-start", toolCallId: "s1-JCbqepQ8K", toolName: "load_skill", toolInput: { name: "image-generation" } },
      { type: "tool-end", toolCallId: "s1-JCbqepQ8K", status: "completed", durationMs: 13, creditCost: 0, result: { skill: "image-generation", loaded: true } },
      { type: "thinking-delta", delta: "Now the image." },
      { type: "tool-start", toolCallId: "s2-8q6qGsyuo", toolName: "gpt_image_2", toolInput: { mode: "text", prompt: "A red apple" } },
    );
    expect(await screen.findByRole("button", { name: /Working · 2 steps/ })).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "The assistant is thinking" })).not.toBeInTheDocument();
  });


});


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
import { renderApp } from "../utils/render";
import { stubLayout } from "../utils/layout";

// Checks without a live stream every 40ms; with one, practically never, so the end of a live run can only be
// noticed through what the stream says (or the quick checks that follow it).
vi.mock("@/lib/timing", async (original) => ({
  ...(await original<typeof import("@/lib/timing")>()),
  RUN_POLL_MS: 40,
  LIVE_POLL_MS: 60_000,
}));
stubLayout();

const activeRunUrl = `${BACKEND_URL}/api/chats/:chatId/active-run`;

// the page in a background tab, as React Query sees it
function setHidden(hidden: boolean) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
  document.dispatchEvent(new Event("visibilitychange"));
}

afterEach(() => {
  delete (document as { visibilityState?: unknown }).visibilityState;
  document.dispatchEvent(new Event("visibilitychange"));
  server.events.removeAllListeners();
  vi.useRealTimers();
});

// requests by path, from now on
function countRequests() {
  const seen = { activeRun: 0, credits: 0, messages: 0 };
  server.events.on("request:start", ({ request }) => {
    const path = new URL(request.url).pathname;
    if (path.endsWith("/active-run")) seen.activeRun++;
    else if (path === "/api/credits") seen.credits++;
    else if (path.endsWith("/messages")) seen.messages++;
  });
  return seen;
}

// a run that was going when the page was (re)loaded
function runningOnServer() {
  getMockDb().runs["chat-greeting"] = { id: "run-1", chatId: "chat-greeting", triggerRunId: "t-run-1", status: "RUNNING", startedAt: new Date().toISOString(), completedAt: null };
}

async function reloadMidRun() {
  runningOnServer();
  const view = renderApp(<ChatWindow chatId="chat-greeting" />);
  await waitFor(() => expect(useChatStore.getState().runs["chat-greeting"]).toMatchObject({ runId: "run-1" }));
  await waitFor(() => expect(realtime.subscriptions.at(-1)).toMatchObject({ runId: "t-run-1" }));
  realtime.setRun({ status: "EXECUTING", metadata: { status: "working" } });
  await screen.findByRole("button", { name: "Stop response" });
  return view;
}

// the run is over on the server (the mock ends a run RUN_MS after it started)
function finishOnServer() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.now() + RUN_MS + 500);
}

describe("a run picked up after a reload, when it ends", () => {
  it("is let go as soon as the live stream says it finished: the server is asked, and credits and the reply reload", async () => {
    await reloadMidRun();
    const seen = countRequests();
    finishOnServer();
    realtime.setRun({ status: "COMPLETED", metadata: { status: "complete" } });

    await waitFor(() => expect(useChatStore.getState().runs["chat-greeting"]).toBeUndefined());
    expect(seen.activeRun).toBeGreaterThan(0);
    expect(seen.messages).toBeGreaterThan(0);
    await waitFor(() => expect(seen.credits).toBeGreaterThan(0));
    expect(await screen.findByText(/This answer comes from the mock backend/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send message" })).toBeInTheDocument();
  });

  it("is let go when only the metadata says so, before Trigger.dev's own status catches up", async () => {
    await reloadMidRun();
    finishOnServer();
    realtime.setRun({ status: "EXECUTING", metadata: { status: "complete" } });
    await waitFor(() => expect(useChatStore.getState().runs["chat-greeting"]).toBeUndefined());
    expect(screen.getByRole("button", { name: "Send message" })).toBeInTheDocument();
  });

  it("in a background tab, still ends when the check right after the stream's signal fails", async () => {
    await reloadMidRun();
    setHidden(true);
    let failOnce = true;
    server.use(
      http.get(activeRunUrl, () => {
        if (!failOnce) return undefined;
        failOnce = false;
        return HttpResponse.error();
      }),
    );
    finishOnServer();
    realtime.setRun({ status: "COMPLETED", metadata: { status: "complete" } });

    await waitFor(() => expect(useChatStore.getState().runs["chat-greeting"]).toBeUndefined());
    expect(failOnce).toBe(false);
    expect(document.visibilityState).toBe("hidden");
  });

  it("in a background tab, keeps checking while there is no live stream, and notices the end", async () => {
    runningOnServer();
    realtime.failStream(); // nothing live: only the checks can tell
    setHidden(true);
    renderApp(<ChatWindow chatId="chat-greeting" />);
    await screen.findByRole("button", { name: "Stop response" });
    const seen = countRequests();
    finishOnServer();

    await waitFor(() => expect(useChatStore.getState().runs["chat-greeting"]).toBeUndefined());
    expect(seen.activeRun).toBeGreaterThan(0);
  });
});

describe("before the server has said whether a run is going (just after a reload)", () => {
  // the first check's answer waits until the test lets it through
  function holdFirstCheck() {
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    let first = true;
    server.use(
      http.get(activeRunUrl, async () => {
        if (!first) return undefined;
        first = false;
        await gate;
        return undefined;
      }),
    );
    return () => release();
  }

  // the conversation ends on the user's message: its reply is still being written (the server leaves
  // unfinished replies out of the history)
  function endsOnUserMessage() {
    getMockDb().messages["chat-greeting"].push({
      id: "m-asked", chatId: "chat-greeting", role: "USER", content: "Make the image darker", contentBlocks: [], status: "COMPLETED", createdAt: new Date().toISOString(), agentRunId: null,
    });
  }

  it("can't send, and shows the reply's Thinking row; then the run turns up with Stop", async () => {
    endsOnUserMessage();
    runningOnServer();
    const release = holdFirstCheck();
    const { user } = renderApp(<ChatWindow chatId="chat-greeting" />);
    await screen.findByText("Make the image darker");

    expect(screen.getByRole("status", { name: "The assistant is thinking" })).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("Send a message…"), "another one");
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    await user.keyboard("{Enter}");
    expect(getMockDb().messages["chat-greeting"].some((m) => m.content === "another one")).toBe(false);

    release();
    expect(await screen.findByRole("button", { name: "Stop response" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "The assistant is thinking" })).toBeInTheDocument();
  });

  it("gives the composer back, and drops the Thinking row, when there turns out to be no run", async () => {
    endsOnUserMessage();
    const release = holdFirstCheck();
    const { user } = renderApp(<ChatWindow chatId="chat-greeting" />);
    await screen.findByText("Make the image darker");
    await user.type(screen.getByPlaceholderText("Send a message…"), "another one");
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();

    release();
    await waitFor(() => expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled());
    expect(screen.queryByRole("status", { name: "The assistant is thinking" })).not.toBeInTheDocument();
  });

  it("shows no Thinking row when the conversation ends on a reply", async () => {
    const release = holdFirstCheck();
    renderApp(<ChatWindow chatId="chat-greeting" />);
    await screen.findByText("Hi! What can I help you with today?");
    expect(screen.queryByRole("status", { name: "The assistant is thinking" })).not.toBeInTheDocument();
    release();
  });
});

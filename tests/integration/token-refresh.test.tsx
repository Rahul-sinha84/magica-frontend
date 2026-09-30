import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { useChatStore } from "@/stores/chatStore";
import { getMockDb } from "../mocks/fixtures";
import { realtime } from "../mocks/trigger";
import { renderApp } from "../utils/render";
import { stubLayout } from "../utils/layout";

vi.mock("@/lib/timing", async (original) => ({ ...(await original<typeof import("@/lib/timing")>()), RUN_POLL_MS: 40, LIVE_POLL_MS: 40 }));
stubLayout();

const LEAD = 30_000;

// A run this tab already knows about, with a token that expires `inMs` from now.
function knownRun(token: string, inMs: number) {
  const now = new Date().toISOString();
  getMockDb().runs["chat-greeting"] = { id: "run-k", chatId: "chat-greeting", triggerRunId: "t-k", status: "RUNNING", startedAt: now, completedAt: null };
  useChatStore.getState().setRun("chat-greeting", {
    runId: "run-k",
    triggerRunId: "t-k",
    realtimeToken: token,
    realtimeTokenExpiresAt: new Date(Date.now() + inMs).toISOString(),
    startedAt: Date.now() - 1000,
  });
}

describe("the stream token", () => {
  it("is replaced shortly before it expires, and the stream reconnects with the new one", async () => {
    // expires 30s + a moment from now, so the refresh is due almost at once
    knownRun("old-token", LEAD + 100);
    renderApp(<ChatWindow chatId="chat-greeting" />);
    await screen.findByRole("button", { name: "Stop response" });
    expect(realtime.subscriptions[0]).toMatchObject({ accessToken: "old-token" });

    await waitFor(() => expect(useChatStore.getState().runs["chat-greeting"]?.realtimeToken).toBe("mock-realtime-token"));
    await waitFor(() => expect(realtime.subscriptions.at(-1)).toMatchObject({ accessToken: "mock-realtime-token" }));
  });

  it("is kept while it is still good, even though every check brings a new one", async () => {
    knownRun("good-token", 3_600_000);
    realtime.push({ type: "text-delta", delta: "live" });
    renderApp(<ChatWindow chatId="chat-greeting" />);
    await screen.findByText("live");
    await new Promise((r) => setTimeout(r, 300)); // several checks at 40ms
    expect(useChatStore.getState().runs["chat-greeting"]?.realtimeToken).toBe("good-token");
    expect(new Set(realtime.subscriptions.map((s) => s.accessToken))).toEqual(new Set(["good-token"]));
  });

  it("is fetched at once when it has already expired", async () => {
    knownRun("expired-token", -5_000);
    renderApp(<ChatWindow chatId="chat-greeting" />);
    await waitFor(() => expect(useChatStore.getState().runs["chat-greeting"]?.realtimeToken).toBe("mock-realtime-token"));
  });
});

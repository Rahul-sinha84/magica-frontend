import { act, renderHook, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { useDeleteChat } from "@/hooks/useDeleteChat";
import { BACKEND_URL } from "@/lib/config";
import { useChatStore } from "@/stores/chatStore";
import { getMockDb } from "../mocks/fixtures";
import { RUN_MS } from "../mocks/handlers";
import { server } from "../mocks/server";
import { realtime } from "../mocks/trigger";
import { renderApp, typeAndSend } from "../utils/render";
import { stubLayout } from "../utils/layout";

vi.mock("@/lib/timing", async (original) => ({
  ...(await original<typeof import("@/lib/timing")>()),
  RUN_POLL_MS: 40,
  LIVE_POLL_MS: 60_000,
}));
stubLayout();
afterEach(() => vi.useRealTimers());

const box = () => screen.getByPlaceholderText("Send a message…");
const at = (path: string) => `${BACKEND_URL}${path}`;

function running(id = "run-1", triggerRunId: string | null = `t-${id}`) {
  const now = new Date().toISOString();
  getMockDb().runs["chat-greeting"] = { id, chatId: "chat-greeting", triggerRunId, status: "RUNNING", startedAt: now, completedAt: null };
}

async function openChat() {
  const view = renderApp(<ChatWindow chatId="chat-greeting" />);
  await screen.findByText("Hi! What can I help you with today?");
  return view;
}

describe("the composer while a reply is being written", () => {
  it("Enter does nothing: no send, and no new line slipped into the next message", async () => {
    running();
    const { user } = await openChat();
    await screen.findByRole("button", { name: "Stop response" });
    await user.type(box(), "next question");
    await user.keyboard("{Enter}");
    expect(box()).toHaveValue("next question");
    expect(getMockDb().messages["chat-greeting"]).toHaveLength(2);
  });

  it("Shift+Enter still adds a line", async () => {
    running();
    const { user } = await openChat();
    await screen.findByRole("button", { name: "Stop response" });
    await user.type(box(), "a{Shift>}{Enter}{/Shift}b");
    expect(box()).toHaveValue("a\nb");
  });

  it("Enter in an empty box doesn't add a line either", async () => {
    const { user } = await openChat();
    await user.click(box());
    await user.keyboard("{Enter}{Enter}");
    expect(box()).toHaveValue("");
  });
});

describe("losing the connection during a run", () => {
  it("says it is reconnecting, keeps what was written, and carries on when the server is back", async () => {
    running();
    let down = false;
    server.use(http.get(at("/api/chats/:chatId/active-run"), () => (down ? HttpResponse.error() : undefined)));
    realtime.push({ type: "text-delta", delta: "Before the drop" });
    realtime.failStream(); // no live stream either: only the checks
    await openChat();
    await screen.findByRole("button", { name: "Stop response" });

    down = true;
    expect(await screen.findByText("Connection lost. Reconnecting…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop response" })).toBeInTheDocument();

    down = false;
    await waitFor(() => expect(screen.queryByText("Connection lost. Reconnecting…")).not.toBeInTheDocument());
  });

  it("keeps the streamed reply on screen when the saved one can't be loaded yet, then swaps it in", async () => {
    running();
    let listDown = false;
    server.use(http.get(at("/api/chats/:chatId/messages"), () => (listDown ? HttpResponse.error() : undefined)));
    realtime.push({ type: "text-delta", delta: "Sure! This answer" });
    await openChat();
    await screen.findByText("Sure! This answer");

    listDown = true;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + RUN_MS + 500);
    realtime.setRun({ status: "COMPLETED" }); // makes the page ask the server now
    // the server says the run is over, but the reply can't be fetched: the streamed text stays
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.getByText("Sure! This answer")).toBeInTheDocument();
    expect(useChatStore.getState().runs["chat-greeting"]).toBeDefined();

    listDown = false;
    expect(await screen.findByText(/This answer comes from the mock backend/)).toBeInTheDocument();
    await waitFor(() => expect(useChatStore.getState().runs["chat-greeting"]).toBeUndefined());
  });
});

describe("runs and Stop requests that outlive their moment", () => {
  it("a Stop left from an earlier send doesn't cancel the next run", async () => {
    const cancels: string[] = [];
    server.use(
      http.post(at("/api/runs/:runId/cancel"), ({ params }) => {
        cancels.push(params.runId as string);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    useChatStore.getState().requestStop("chat-greeting");
    const { user } = await openChat();
    await typeAndSend(user, box(), "fresh start");
    await screen.findByRole("button", { name: "Stop response" });
    await new Promise((r) => setTimeout(r, 150));
    expect(cancels).toEqual([]);
  });

  it("starts streaming once a restored run gets its Trigger.dev id", async () => {
    running("run-1", null);
    await openChat();
    await screen.findByRole("button", { name: "Stop response" });
    expect(realtime.subscriptions).toHaveLength(0);
    getMockDb().runs["chat-greeting"].triggerRunId = "t-late";
    await waitFor(() => expect(realtime.subscriptions.at(-1)).toMatchObject({ runId: "t-late" }));
  });

  it("deleting a task lets go of its run", async () => {
    running();
    useChatStore.getState().setRun("chat-greeting", { runId: "run-1", triggerRunId: "t-run-1", realtimeToken: null, realtimeTokenExpiresAt: null, startedAt: Date.now() });
    const { client } = renderApp(<div />);
    const { QueryClientProvider } = await import("@tanstack/react-query");
    const { result } = renderHook(() => useDeleteChat(), { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
    await act(() => result.current.mutateAsync("chat-greeting"));
    expect(useChatStore.getState().runs["chat-greeting"]).toBeUndefined();
  });
});

describe("the streaming reply", () => {
  it("puts the thinking time on the first think only", async () => {
    running();
    realtime.setRun({ status: "EXECUTING", metadata: { status: "streaming", thinkingDurationMs: 1500 } });
    realtime.push(
      { type: "thinking-delta", delta: "first" },
      { type: "text-delta", delta: "middle" },
      { type: "thinking-delta", delta: "second" },
      { type: "text-delta", delta: "end" },
    );
    await openChat();
    expect(await screen.findByRole("button", { name: "Thought for 1.5s" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Thought for/ })).toHaveLength(1);
  });

  it("isn't announced to screen readers on every chunk", async () => {
    running();
    realtime.push({ type: "text-delta", delta: "quiet please" });
    await openChat();
    const row = (await screen.findByText("quiet please")).closest('[aria-busy="true"]');
    expect(row).toHaveAttribute("aria-live", "off");
  });
});

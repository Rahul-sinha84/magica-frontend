import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { useChatStore } from "@/stores/chatStore";
import { getMockDb } from "../mocks/fixtures";
import { realtime } from "../mocks/trigger";
import { renderApp } from "../utils/render";
import { stubLayout } from "../utils/layout";

stubLayout();

const running = (chatId: string, id: string) => {
  const now = new Date().toISOString();
  getMockDb().runs[chatId] = { id, chatId, triggerRunId: `t-${id}`, status: "RUNNING", startedAt: now, completedAt: null };
};

describe("restoring a run", () => {
  it("picks up the server's run on opening the page (a reload mid-run) and subscribes to it", async () => {
    running("chat-greeting", "run-1");
    renderApp(<ChatWindow chatId="chat-greeting" />);
    await waitFor(() => expect(useChatStore.getState().runs["chat-greeting"]).toMatchObject({ runId: "run-1", triggerRunId: "t-run-1" }));
    await waitFor(() => expect(realtime.subscriptions.at(-1)).toMatchObject({ runId: "t-run-1", accessToken: "mock-realtime-token" }));
    expect(screen.getByRole("button", { name: "Stop response" })).toBeInTheDocument();
  });

  it("shows what the run had already written before the reload", async () => {
    running("chat-greeting", "run-1");
    realtime.push({ type: "text-delta", delta: "Written before the reload" });
    renderApp(<ChatWindow chatId="chat-greeting" />);
    expect(await screen.findByText("Written before the reload")).toBeInTheDocument();
  });

  it("does not replace a run this tab already follows", async () => {
    running("chat-greeting", "run-1");
    useChatStore.getState().setRun("chat-greeting", { runId: "run-1", triggerRunId: "t-run-1", realtimeToken: "mine", realtimeTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(), startedAt: 123 , status: "RUNNING", statusAt: 0});
    renderApp(<ChatWindow chatId="chat-greeting" />);
    await screen.findByRole("button", { name: "Stop response" });
    await new Promise((r) => setTimeout(r, 100));
    expect(useChatStore.getState().runs["chat-greeting"]).toMatchObject({ startedAt: 123, realtimeToken: "mine" });
  });

  it("leaves another task's run alone when switching tasks", async () => {
    running("chat-apple", "run-a");
    useChatStore.getState().setRun("chat-apple", { runId: "run-a", triggerRunId: "t-run-a", realtimeToken: "a", realtimeTokenExpiresAt: null, startedAt: Date.now() , status: "RUNNING", statusAt: 0});
    const { rerender } = renderApp(<ChatWindow key="chat-apple" chatId="chat-apple" />);
    await screen.findByRole("button", { name: "Stop response" });
    rerender(<ChatWindow key="chat-greeting" chatId="chat-greeting" />);
    await screen.findByText("Hi! What can I help you with today?");
    expect(screen.queryByRole("button", { name: "Stop response" })).not.toBeInTheDocument();
    expect(useChatStore.getState().runs["chat-apple"]).toMatchObject({ runId: "run-a" });
    rerender(<ChatWindow key="chat-apple" chatId="chat-apple" />);
    expect(await screen.findByRole("button", { name: "Stop response" })).toBeInTheDocument();
  });

  it("drops a run that finished while this tab was elsewhere", async () => {
    useChatStore.getState().setRun("chat-greeting", { runId: "run-old", triggerRunId: "t-old", realtimeToken: null, realtimeTokenExpiresAt: null, startedAt: Date.now() - 60_000 , status: "RUNNING", statusAt: 0});
    renderApp(<ChatWindow chatId="chat-greeting" />);
    await waitFor(() => expect(useChatStore.getState().runs["chat-greeting"]).toBeUndefined());
    expect(screen.queryByRole("button", { name: "Stop response" })).not.toBeInTheDocument();
  });
});

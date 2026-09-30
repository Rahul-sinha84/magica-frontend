import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { useChatStore } from "@/stores/chatStore";
import { getMockDb } from "../mocks/fixtures";
import { RUN_MS } from "../mocks/handlers";
import { renderApp, typeAndSend } from "../utils/render";
import { stubLayout } from "../utils/layout";

// poll fast, so the tests don't wait two seconds per round
vi.mock("@/lib/timing", () => ({ RUN_POLL_MS: 40 }));
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

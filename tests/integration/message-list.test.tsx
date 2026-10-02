import { screen, waitFor, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { useChatStore } from "@/stores/chatStore";
import { addLongChat, getMockDb } from "../mocks/fixtures";
import { RUN_MS } from "../mocks/handlers";
import { realtime } from "../mocks/trigger";
import { renderApp, typeAndSend } from "../utils/render";
import { stubLayout } from "../utils/layout";

stubLayout();
afterEach(() => vi.useRealTimers());

function openLong() {
  addLongChat(getMockDb());
  return renderApp(<ChatWindow chatId="chat-long" />);
}

describe("a long conversation", () => {
  it("draws only the rows near the window, not all 240", async () => {
    openLong();
    await screen.findByRole("log", { name: "Conversation" });
    await waitFor(() => expect(document.querySelectorAll("[data-index]").length).toBeGreaterThan(0));
    expect(document.querySelectorAll("[data-index]").length).toBeLessThan(40);
  });

  it("asks for older messages when scrolled near the top", async () => {
    const { client } = openLong();
    const log = await screen.findByRole("log", { name: "Conversation" });
    await waitFor(() => expect(document.querySelectorAll("[data-index]").length).toBeGreaterThan(0));
    fireEvent.scroll(log, { target: { scrollTop: 0 } });
    await waitFor(() => {
      const data = client.getQueryData<{ pages: unknown[] }>(["messages", "chat-long"]);
      expect(data!.pages.length).toBeGreaterThan(1);
    });
  });

  it("shows a jump-to-bottom button only when you've scrolled away", async () => {
    openLong();
    const log = await screen.findByRole("log", { name: "Conversation" });
    await waitFor(() => expect(document.querySelectorAll("[data-index]").length).toBeGreaterThan(0));
    expect(screen.queryByRole("button", { name: "Scroll to bottom" })).not.toBeInTheDocument();
    Object.defineProperty(log, "scrollHeight", { configurable: true, value: 5000 });
    fireEvent.scroll(log, { target: { scrollTop: 1000 } });
    expect(await screen.findByRole("button", { name: "Scroll to bottom" })).toBeInTheDocument();
  });
});

describe("a short conversation", () => {
  it("has no jump button and no older-messages indicator", async () => {
    renderApp(<ChatWindow chatId="chat-greeting" />);
    await screen.findByText("Hi! What can I help you with today?");
    expect(screen.queryByRole("button", { name: "Scroll to bottom" })).not.toBeInTheDocument();
    expect(screen.queryByText("Loading earlier messages")).not.toBeInTheDocument();
  });
});

// In these tests every row measures 800px and so does the view, under 40px of space at the top. The
// greeting task has two messages, so the one sent is the third row and starts at 40 + 800 * 2.
describe("sending a message (as on magica)", () => {
  const SENT_TOP = 40 + 800 * 2;
  const content = (log: HTMLElement) => log.firstElementChild as HTMLElement;

  async function send() {
    const view = renderApp(<ChatWindow chatId="chat-greeting" />);
    await screen.findByText("Hi! What can I help you with today?");
    const log = screen.getByRole("log", { name: "Conversation" });
    await typeAndSend(view.user, screen.getByPlaceholderText("Send a message…"), "tell me something");
    await waitFor(() => expect(realtime.subscriptions.length).toBeGreaterThan(0));
    return log;
  }

  it("scrolls the question just sent to the top of the view", async () => {
    const log = await send();
    await waitFor(() => expect(log.scrollTop).toBe(SENT_TOP));
  });

  it("lets the reply grow below without following it, and offers the jump down", async () => {
    const log = await send();
    await waitFor(() => expect(log.scrollTop).toBe(SENT_TOP));
    Object.defineProperty(log, "scrollHeight", { configurable: true, value: 9000 });
    realtime.push({ type: "text-delta", delta: "A long answer" });
    await screen.findByText("A long answer");
    expect(log.scrollTop).toBe(SENT_TOP);
    expect(await screen.findByRole("button", { name: "Scroll to bottom" })).toBeInTheDocument();
  });

  it("adds room under the last turn so it fills the view, and keeps it when the reply lands", async () => {
    // a 2000px view (rows still measure 800px)
    const height = function (this: HTMLElement) {
      return this.getAttribute("role") === "log" ? 2000 : 800;
    };
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(height);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(height);
    const log = await send();
    // the question and the reply take 1600px of the 2000px view; the rest is added under them
    await waitFor(() => expect(content(log).style.height).toBe(`${SENT_TOP + 2000}px`));
    expect(log.scrollTop).toBe(SENT_TOP);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + RUN_MS + 500);
    realtime.setRun({ status: "COMPLETED", metadata: { status: "complete" } });
    await waitFor(() => expect(useChatStore.getState().runs["chat-greeting"]).toBeUndefined());
    await screen.findByText(/This answer comes from the mock backend/);
    expect(content(log).style.height).toBe(`${SENT_TOP + 2000}px`);
    expect(log.scrollTop).toBe(SENT_TOP);
  });

  it("dims the model pill while the reply is written", async () => {
    await send();
    expect(screen.getByRole("button", { name: /Magica Auto/ })).toHaveClass("opacity-50");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + RUN_MS + 500);
    realtime.setRun({ status: "COMPLETED", metadata: { status: "complete" } });
    await waitFor(() => expect(screen.getByRole("button", { name: /Magica Auto/ })).not.toHaveClass("opacity-50"));
  });
});

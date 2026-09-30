import { screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { addLongChat, getMockDb } from "../mocks/fixtures";
import { renderApp } from "../utils/render";
import { stubLayout } from "../utils/layout";

stubLayout();

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

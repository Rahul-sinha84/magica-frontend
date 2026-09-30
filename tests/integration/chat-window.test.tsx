import { screen, waitFor } from "@testing-library/react";
import { delay, http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { BACKEND_URL } from "@/lib/config";
import { getMockDb } from "../mocks/fixtures";
import { server } from "../mocks/server";
import { renderApp } from "../utils/render";

const at = (path: string) => `${BACKEND_URL}${path}`;
const chatEndpoint = (handler: Parameters<typeof http.get>[1]) => http.get(at("/api/chats/:chatId"), handler);

describe("chat window", () => {
  it("names the browser tab after the task", async () => {
    renderApp(<ChatWindow chatId="chat-greeting" />);
    await waitFor(() => expect(document.title).toBe("Greeting | Magica"));
  });

  it("has the composer and the files button", () => {
    renderApp(<ChatWindow chatId="chat-greeting" />);
    expect(screen.getByPlaceholderText("Send a message…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View all files in this task" })).toBeInTheDocument();
  });

  it("says when the task doesn't exist, with a way back", async () => {
    renderApp(<ChatWindow chatId="nope" />);
    expect(await screen.findByRole("heading", { name: "This task doesn't exist" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New task" })).toHaveAttribute("href", "/chat");
    expect(screen.queryByPlaceholderText("Send a message…")).not.toBeInTheDocument();
  });

  it("does not flash 'doesn't exist' while the task is still loading", async () => {
    server.use(
      chatEndpoint(async () => {
        await delay(150);
        return HttpResponse.json({ error: "Chat not found", code: "NOT_FOUND" }, { status: 404 });
      }),
    );
    renderApp(<ChatWindow chatId="chat-greeting" />);
    expect(screen.queryByText("This task doesn't exist")).not.toBeInTheDocument();
    expect(await screen.findByText("This task doesn't exist")).toBeInTheDocument();
  });

  it("does not claim a task is gone just because the request failed", async () => {
    server.use(chatEndpoint(() => HttpResponse.json({ error: "down", code: "INTERNAL_ERROR" }, { status: 500 })));
    renderApp(<ChatWindow chatId="chat-greeting" />);
    await waitFor(() => expect(document.title).toBe("Magica"));
    expect(screen.queryByText("This task doesn't exist")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Send a message…")).toBeInTheDocument();
  });

  it("notices when the task is deleted while you are looking at it", async () => {
    const { client } = renderApp(<ChatWindow chatId="chat-greeting" />);
    await waitFor(() => expect(document.title).toBe("Greeting | Magica"));

    getMockDb().chats = getMockDb().chats.filter((c) => c.id !== "chat-greeting");
    await client.invalidateQueries({ queryKey: ["chat", "chat-greeting"] });
    expect(await screen.findByText("This task doesn't exist")).toBeInTheDocument();
  });

  it("finds an old task that isn't on the first page of the sidebar list", async () => {
    const base = getMockDb().chats[0];
    getMockDb().chats = Array.from({ length: 120 }, (_, i) => ({ ...base, id: `t${i}`, title: `Task ${i}`, lastMessageAt: new Date(2026, 0, 1, 0, i).toISOString() }));

    renderApp(<ChatWindow chatId="t0" />);

    await waitFor(() => expect(document.title).toBe("Task 0 | Magica"));
    expect(screen.queryByText("This task doesn't exist")).not.toBeInTheDocument();
  });

  it("names the tab for a task with no title", async () => {
    server.use(chatEndpoint(() => HttpResponse.json({ chat: { ...getMockDb().chats[0], id: "blank", title: "  " } })));
    renderApp(<ChatWindow chatId="blank" />);
    await waitFor(() => expect(document.title).toBe("Untitled task | Magica"));
  });
});

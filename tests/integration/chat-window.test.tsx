import { screen, waitFor } from "@testing-library/react";
import { delay, http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { BACKEND_URL } from "@/lib/config";
import { server } from "../mocks/server";
import { renderApp } from "../utils/render";

const at = (path: string) => `${BACKEND_URL}${path}`;

describe("chat window", () => {
  it("names the browser tab after the task", async () => {
    renderApp(<ChatWindow chatId="chat-greeting" />);
    await waitFor(() => expect(document.title).toBe("Greeting | Magica"));
  });

  it("has the composer and the files button", async () => {
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

  it("does not flash 'doesn't exist' while the list is still loading", async () => {
    server.use(
      http.get(at("/api/chats"), async () => {
        await delay(150);
        return HttpResponse.json({ chats: [] });
      }),
    );
    renderApp(<ChatWindow chatId="chat-greeting" />);
    expect(screen.queryByText("This task doesn't exist")).not.toBeInTheDocument();
    expect(await screen.findByText("This task doesn't exist")).toBeInTheDocument();
  });

  it("does not claim a task is gone just because the list failed to load", async () => {
    server.use(http.get(at("/api/chats"), () => HttpResponse.json({ error: "down" }, { status: 500 })));
    renderApp(<ChatWindow chatId="chat-greeting" />);
    await waitFor(() => expect(document.title).toBe("Magica"));
    expect(screen.queryByText("This task doesn't exist")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Send a message…")).toBeInTheDocument();
  });

  it("notices when the task is deleted while you are looking at it", async () => {
    const { client } = renderApp(<ChatWindow chatId="chat-greeting" />);
    await waitFor(() => expect(document.title).toBe("Greeting | Magica"));

    client.setQueryData(["chats"], []);
    expect(await screen.findByText("This task doesn't exist")).toBeInTheDocument();
  });
});

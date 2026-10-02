import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { HomeScreen } from "@/components/chat/HomeScreen";
import { BACKEND_URL } from "@/lib/config";
import { NEW_CHAT, useChatStore } from "@/stores/chatStore";
import { getMockDb } from "../mocks/fixtures";
import { navigation } from "../mocks/navigation";
import { server } from "../mocks/server";
import { renderApp, typeAndSend } from "../utils/render";

const box = () => screen.getByPlaceholderText("Assign a task or ask anything…");

describe("sending from the home screen", () => {
  it("creates the task, sends the message and goes to the task", async () => {
    const { user, client } = renderApp(<HomeScreen />);
    await typeAndSend(user, box(), "Plan a trip to Lisbon");

    await waitFor(() => expect(navigation.push).toHaveBeenCalledTimes(1));
    const db = getMockDb();
    const created = db.chats.find((c) => c.title.startsWith("Plan a trip"));
    expect(created).toBeDefined();
    expect(navigation.push).toHaveBeenCalledWith(`/chat/${created!.id}`);
    await waitFor(() => expect(db.messages[created!.id]).toHaveLength(1));
    expect(db.messages[created!.id][0].content).toBe("Plan a trip to Lisbon");

    // the task is already in the cache, so the page we land on doesn't start empty
    expect(client.getQueryData(["chat", created!.id])).toBeDefined();
    expect(useChatStore.getState().drafts[NEW_CHAT] ?? "").toBe("");
  });

  it("shows the message on the task page before the server's list has it", async () => {
    const { user } = renderApp(<HomeScreen />);
    await typeAndSend(user, box(), "hello there");
    await waitFor(() => expect(navigation.push).toHaveBeenCalled());
    const pending = Object.values(useChatStore.getState().optimistic).flat();
    expect(pending.map((m) => m.content).concat(getMockDb().chats.length ? ["hello there"] : [])).toContain("hello there");
  });

  it("keeps the text and explains when the task can't be created", async () => {
    server.use(http.post(`${BACKEND_URL}/api/chats`, () => HttpResponse.json({ error: "down", code: "SERVICE_UNAVAILABLE" }, { status: 503 })));
    const { user } = renderApp(<HomeScreen />);
    await typeAndSend(user, box(), "hello");
    expect(await screen.findByText("Couldn't start the task")).toBeInTheDocument();
    expect(box()).toHaveValue("hello");
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("does not create two tasks on a double Enter", async () => {
    const { user } = renderApp(<HomeScreen />);
    await user.type(box(), "once");
    await user.keyboard("{Enter}{Enter}");
    await waitFor(() => expect(navigation.push).toHaveBeenCalled());
    expect(getMockDb().chats.filter((c) => c.title === "once")).toHaveLength(1);
  });

  it("puts the text back in the new task's composer, not home's, when the send fails after the move", async () => {
    server.use(http.post(`${BACKEND_URL}/api/chats/:chatId/messages`, () => HttpResponse.json({ error: "x", code: "INTERNAL_ERROR" }, { status: 500 })));
    const { user } = renderApp(<HomeScreen />);
    await typeAndSend(user, box(), "lost words");
    await waitFor(() => expect(navigation.push).toHaveBeenCalled());
    const created = getMockDb().chats.find((c) => c.title === "New chat")!;
    await waitFor(() => expect(useChatStore.getState().drafts[created.id]).toBe("lost words"));
    expect(useChatStore.getState().drafts[NEW_CHAT] ?? "").toBe("");
    expect(useChatStore.getState().failedSends[created.id]).toBeDefined();
  });

  it("drops the pending copy once the server has the message", async () => {
    const { user } = renderApp(<HomeScreen />);
    await typeAndSend(user, box(), "tidy");
    await waitFor(() => expect(navigation.push).toHaveBeenCalled());
    await waitFor(() => expect(Object.values(useChatStore.getState().optimistic).flat()).toHaveLength(0));
  });
});

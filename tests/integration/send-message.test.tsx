import { screen, waitFor, within } from "@testing-library/react";
import { delay, http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { BACKEND_URL } from "@/lib/config";
import { useChatStore } from "@/stores/chatStore";
import { getMockDb } from "../mocks/fixtures";
import { server } from "../mocks/server";
import { renderApp, typeAndSend } from "../utils/render";
import { stubLayout } from "../utils/layout";

stubLayout();

const sendUrl = `${BACKEND_URL}/api/chats/:chatId/messages`;
const box = () => screen.getByPlaceholderText("Send a message…");
const greeting = () => getMockDb().messages["chat-greeting"];

async function openChat() {
  const view = renderApp(<ChatWindow chatId="chat-greeting" />);
  await screen.findByText("Hi! What can I help you with today?");
  return view;
}

describe("sending a message", () => {
  it("shows your message at once, before the server answers", async () => {
    server.use(http.post(sendUrl, async () => { await delay(300); return HttpResponse.json({}, { status: 500 }); }));
    const { user } = await openChat();
    await user.type(box(), "What is 2+2?");
    await user.keyboard("{Enter}");
    expect(await screen.findByText("What is 2+2?")).toBeInTheDocument();
    expect(box()).toHaveValue("");
    // let the failure finish inside this test, so it can't put its text back during the next one
    await waitFor(() => expect(box()).toHaveValue("What is 2+2?"));
  });

  it("sends with Enter and keeps the message without a gap or a double", async () => {
    const { user } = await openChat();
    await typeAndSend(user, box(), "What is 2+2?");
    await waitFor(() => expect(greeting().some((m) => m.content === "What is 2+2?")).toBe(true));
    // the server's copy replaces the pending one: still exactly one
    await waitFor(() => expect(useChatStore.getState().runs["chat-greeting"]).toBeDefined());
    expect(screen.getAllByText("What is 2+2?")).toHaveLength(1);
  });

  it("sends the client id so the server copy can be matched", async () => {
    let body = {} as { clientMessageId?: string };
    server.use(http.post(sendUrl, async ({ request }) => { body = (await request.clone().json()) as { clientMessageId?: string }; return undefined; }));
    const { user } = await openChat();
    await typeAndSend(user, box(), "hello");
    await waitFor(() => expect(body.clientMessageId).toMatch(/^[0-9a-f-]{36}$/));
  });

  it("adds a new line with Shift+Enter and sends nothing", async () => {
    const { user } = await openChat();
    await user.type(box(), "a{Shift>}{Enter}{/Shift}b");
    expect(box()).toHaveValue("a\nb");
    expect(greeting()).toHaveLength(2);
  });

  it("does not send empty or blank text", async () => {
    const { user } = await openChat();
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    await typeAndSend(user, box(), "   ");
    expect(greeting()).toHaveLength(2);
  });

  it("shows Thinking and turns Send into Stop while the reply is written", async () => {
    const { user } = await openChat();
    await typeAndSend(user, box(), "hello");
    expect(await screen.findByRole("status", { name: "The assistant is thinking" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop response" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send message" })).not.toBeInTheDocument();
  });

  it("Stop cancels the run", async () => {
    const { user } = await openChat();
    await typeAndSend(user, box(), "hello");
    await user.click(await screen.findByRole("button", { name: "Stop response" }));
    await waitFor(() => expect(getMockDb().runs["chat-greeting"].status).toBe("CANCELLED"));
    await waitFor(() => expect(screen.queryByRole("status", { name: "The assistant is thinking" })).not.toBeInTheDocument());
  });

  it("does not send twice on a quick double Enter", async () => {
    let calls = 0;
    server.use(http.post(sendUrl, async () => { calls++; await delay(100); return undefined; }));
    const { user } = await openChat();
    await user.type(box(), "once");
    await user.keyboard("{Enter}{Enter}");
    await waitFor(() => expect(calls).toBe(1));
  });

  it("keeps a separate draft for each task", async () => {
    const { user, rerender } = await openChat();
    await user.type(box(), "unsent thought");
    rerender(<ChatWindow chatId="chat-apple" />);
    await screen.findByText("Generate an image of a red apple on a white table");
    expect(box()).toHaveValue("");
    rerender(<ChatWindow chatId="chat-greeting" />);
    expect(box()).toHaveValue("unsent thought");
  });
});

describe("when sending fails", () => {
  it("removes the message, puts the text back and explains", async () => {
    server.use(http.post(sendUrl, () => HttpResponse.json({ error: "Not enough credits", code: "INSUFFICIENT_CREDITS" }, { status: 402 })));
    const { user } = await openChat();
    await typeAndSend(user, box(), "please work");
    await waitFor(() => expect(box()).toHaveValue("please work"));
    expect(await screen.findByText("Message not sent")).toBeInTheDocument();
    expect(screen.getByText("You don't have enough credits for this.")).toBeInTheDocument();
    await waitFor(() => expect(box()).toHaveValue("please work"));
    expect(screen.queryByText("please work", { selector: "div" })).not.toBeInTheDocument();
  });

  it("does not overwrite what you typed meanwhile", async () => {
    server.use(http.post(sendUrl, async () => { await delay(150); return HttpResponse.json({ error: "x", code: "INTERNAL_ERROR" }, { status: 500 }); }));
    const { user } = await openChat();
    await typeAndSend(user, box(), "first");
    await user.type(box(), "second");
    await waitFor(() => expect(box()).toHaveValue("first\nsecond"));
  });

  it("treats a 409 as 'a reply is already being written', not a crash", async () => {
    server.use(http.post(sendUrl, () => HttpResponse.json({ error: "busy", code: "RUN_ACTIVE" }, { status: 409 })));
    const { user } = await openChat();
    await typeAndSend(user, box(), "again");
    expect(await screen.findByText("A response is already being generated")).toBeInTheDocument();
    await waitFor(() => expect(box()).toHaveValue("again"));
  });

  it("checks whether the server got it before calling a timeout a failure", async () => {
    server.use(
      http.post(sendUrl, async ({ request }) => {
        const body = (await request.clone().json()) as { content: string; clientMessageId: string };
        // the server stores the message, then the answer is lost
        getMockDb().messages["chat-greeting"].push({
          id: "m-arrived", chatId: "chat-greeting", role: "USER", content: body.content, contentBlocks: [],
          status: "COMPLETED", createdAt: new Date().toISOString(), agentRunId: null, clientMessageId: body.clientMessageId,
        });
        return HttpResponse.json({ error: "gateway", code: "SERVICE_UNAVAILABLE" }, { status: 504 });
      }),
    );
    const { user } = await openChat();
    await typeAndSend(user, box(), "it arrived");
    expect(await screen.findByText("it arrived")).toBeInTheDocument();
    await waitFor(() => expect(box()).toHaveValue(""));
    expect(screen.queryByText("Message not sent")).not.toBeInTheDocument();
  });

  it("reuses the same id when the same text is sent again after a failure", async () => {
    const ids: string[] = [];
    let fail = true;
    server.use(
      http.post(sendUrl, async ({ request }) => {
        ids.push(((await request.clone().json()) as { clientMessageId: string }).clientMessageId);
        return fail ? HttpResponse.json({ error: "x", code: "INTERNAL_ERROR" }, { status: 500 }) : undefined;
      }),
    );
    const { user } = await openChat();
    await typeAndSend(user, box(), "retry me");
    await waitFor(() => expect(box()).toHaveValue("retry me"));
    fail = false;
    await user.keyboard("{Enter}");
    await waitFor(() => expect(ids).toHaveLength(2));
    expect(ids[1]).toBe(ids[0]);
  });

  it("refuses text with a NUL character", async () => {
    const { user } = await openChat();
    await user.click(box());
    await user.paste("bad\u0000text");
    await user.keyboard("{Enter}");
    expect(await screen.findByText("Message not sent")).toBeInTheDocument();
    expect(greeting()).toHaveLength(2);
  });
});

describe("the conversation", () => {
  it("shows the history, with the user's message first", async () => {
    await openChat();
    const log = screen.getByRole("log", { name: "Conversation" });
    expect(within(log).getByText("Hello")).toBeInTheDocument();
  });
});

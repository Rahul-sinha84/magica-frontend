import { delay, http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApi } from "@/lib/api";
import { BACKEND_URL } from "@/lib/config";
import { ApiError } from "@/lib/queryClient";
import { addRetryChat, getMockDb } from "../mocks/fixtures";
import { MOCK_REPLY, RUN_MS } from "../mocks/handlers";
import { server } from "../mocks/server";

const at = (path: string) => `${BACKEND_URL}${path}`;
const api = createApi(async () => "test-token");
// the backend accepts only UUIDs as client message ids
const uuid = () => crypto.randomUUID();
const PAGE_SIZE = 50; // the backend's default page size

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function failure(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

describe("responses", () => {
  it("returns data that matches the contract", async () => {
    const { chats } = await api.chats.list();
    expect(chats.map((chat) => chat.id)).toEqual(["chat-apple", "chat-greeting"]);
  });

  it("sends the bearer token", async () => {
    let header: string | null = null;
    server.use(
      http.get(at("/api/credits"), ({ request }) => {
        header = request.headers.get("authorization");
        return HttpResponse.json({ balance: 1, held: 0 });
      }),
    );
    await api.credits.get();
    expect(header).toBe("Bearer test-token");
  });

  it("rejects a response that breaks the contract", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    server.use(http.get(at("/api/chats"), () => HttpResponse.json({ chats: "nope" })));
    const error = await failure(api.chats.list());
    expect(error.status).toBe(422);
  });

  it("rejects a 200 that is not JSON", async () => {
    server.use(http.get(at("/api/credits"), () => new HttpResponse("<html>proxy error</html>")));
    expect((await failure(api.credits.get())).status).toBe(502);
  });

  it("uses the backend's error message and code", async () => {
    const error = await failure(api.messages.list("missing-chat"));
    expect(error).toMatchObject({ status: 404, message: "Chat not found", code: "NOT_FOUND" });
  });

  it("falls back to a generic message when the error has no body", async () => {
    server.use(http.get(at("/api/credits"), () => new HttpResponse(null, { status: 500 })));
    expect(await failure(api.credits.get())).toMatchObject({ status: 500, message: "The server ran into a problem. Try again in a moment." });
  });

  it("escapes ids in the path", async () => {
    let path = "";
    server.use(
      http.delete(at("/api/chats/*"), ({ request }) => {
        path = new URL(request.url).pathname;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await api.chats.delete("a b?x");
    expect(path).toBe("/api/chats/a%20b%3Fx");
  });
});

describe("when the network misbehaves", () => {
  it("turns a failed connection into a readable error", async () => {
    server.use(http.get(at("/api/chats"), () => HttpResponse.error()));
    expect(await failure(api.chats.list())).toMatchObject({ status: 0, message: "Could not reach the server." });
  });

  it("gives up on a server that never answers", async () => {
    server.use(
      http.get(at("/api/chats"), async () => {
        await delay("infinite");
        return HttpResponse.json({});
      }),
    );
    const impatient = createApi(async () => "test-token", { timeoutMs: 50 });
    expect(await failure(impatient.chats.list())).toMatchObject({ status: 0, message: "The server took too long to respond." });
  });

  it("lets the caller cancel without reporting an error", async () => {
    server.use(
      http.get(at("/api/chats"), async () => {
        await delay("infinite");
        return HttpResponse.json({});
      }),
    );
    const controller = new AbortController();
    const pending = api.chats.list(null, controller.signal);
    controller.abort();
    await expect(pending).rejects.not.toBeInstanceOf(ApiError);
  });
});

describe("the backend's error shape", () => {
  const respond = (body: unknown, status = 400) => server.use(http.get(at("/api/credits"), () => HttpResponse.json(body as object, { status })));

  it("reads error, code and keeps the details", async () => {
    respond({ error: "Not enough credits.", code: "INSUFFICIENT_CREDITS", details: { needed: 50, available: 10 } }, 402);
    const error = await failure(api.credits.get());
    expect(error).toMatchObject({ status: 402, message: "Not enough credits.", code: "INSUFFICIENT_CREDITS" });
    expect(error.body).toMatchObject({ details: { needed: 50, available: 10 } });
  });

  it("has no code when the body has none", async () => {
    respond({ error: "Something broke" }, 500);
    const error = await failure(api.credits.get());
    expect(error.message).toBe("Something broke");
    expect(error.code).toBeUndefined();
  });

  it("ignores a code that isn't a string", async () => {
    respond({ error: "Odd", code: { nested: true } }, 400);
    expect((await failure(api.credits.get())).code).toBeUndefined();
  });

  it("falls back to wording by status, with no code, when the body isn't the backend's", async () => {
    server.use(http.get(at("/api/credits"), () => new HttpResponse("<html>Bad gateway</html>", { status: 502 })));
    const error = await failure(api.credits.get());
    expect(error).toMatchObject({ status: 502, message: "The server ran into a problem. Try again in a moment." });
    expect(error.code).toBeUndefined();
  });

  it("has no code for failures that never reached the backend", async () => {
    server.use(http.get(at("/api/credits"), () => HttpResponse.error()));
    expect((await failure(api.credits.get())).code).toBeUndefined();
  });
});

describe("error wording", () => {
  it.each([
    [403, "You don't have access to that."],
    [429, "Too many requests. Wait a moment and try again."],
    [503, "The server ran into a problem. Try again in a moment."],
    [418, "Request failed (418)."],
  ])("explains a bare %i", async (status, message) => {
    server.use(http.get(at("/api/credits"), () => new HttpResponse(null, { status })));
    expect(await failure(api.credits.get())).toMatchObject({ status, message });
  });

  it("prefers the backend's own message, even on a 500", async () => {
    server.use(http.get(at("/api/credits"), () => HttpResponse.json({ error: "Billing is down" }, { status: 500 })));
    expect((await failure(api.credits.get())).message).toBe("Billing is down");
  });

  it("ignores an error body that is not a plain string", async () => {
    server.use(http.get(at("/api/credits"), () => HttpResponse.json({ error: { code: 7 } }, { status: 400 })));
    expect((await failure(api.credits.get())).message).toBe("Request failed (400).");
  });
});

describe("abort signals", () => {
  const never = http.get(at("/api/chats"), async () => {
    await delay("infinite");
    return HttpResponse.json({});
  });

  it("still times out when the caller also passes a signal", async () => {
    server.use(never);
    const impatient = createApi(async () => "test-token", { timeoutMs: 50 });
    const error = await failure(impatient.chats.list(null, new AbortController().signal));
    expect(error.message).toBe("The server took too long to respond.");
  });

  it("does not need AbortSignal.any (Safari before 17.4)", async () => {
    const original = AbortSignal.any;
    // @ts-expect-error simulating a browser without the API
    delete AbortSignal.any;
    try {
      await expect(api.chats.list(null, new AbortController().signal)).resolves.toHaveProperty("chats");
      const controller = new AbortController();
      server.use(never);
      const pending = api.chats.list(null, controller.signal);
      controller.abort();
      await expect(pending).rejects.not.toBeInstanceOf(ApiError);
    } finally {
      AbortSignal.any = original;
    }
  });

  it("does not start a request for a signal that is already aborted", async () => {
    const requests = vi.fn();
    server.use(http.get(at("/api/chats"), () => (requests(), HttpResponse.json({ chats: [] }))));
    const controller = new AbortController();
    controller.abort();
    await expect(api.chats.list(null, controller.signal)).rejects.not.toBeInstanceOf(ApiError);
    expect(requests).not.toHaveBeenCalled();
  });
});

describe("authentication", () => {
  it("turns a throwing getToken (expired token, no network) into a readable error", async () => {
    const offline = createApi(async () => {
      throw new Error("ClerkJS: network error");
    });
    expect(await failure(offline.chats.list())).toMatchObject({
      status: 0,
      message: "Could not verify your session. Check your connection and try again.",
    });
  });

  it("does the same when only the fresh-token retry throws", async () => {
    server.use(http.get(at("/api/credits"), () => HttpResponse.json({ error: "expired" }, { status: 401 })));
    const getToken = async (options?: { skipCache?: boolean }) => {
      if (options?.skipCache) throw new Error("offline");
      return "stale";
    };
    expect((await failure(createApi(getToken).credits.get())).status).toBe(0);
  });

  it("does not call the backend without a token", async () => {
    const requests = vi.fn();
    server.use(http.get(at("/api/chats"), () => (requests(), HttpResponse.json({ chats: [] }))));
    const signedOut = createApi(async () => null);
    expect((await failure(signedOut.chats.list())).status).toBe(401);
    expect(requests).not.toHaveBeenCalled();
  });

  it("retries once with a fresh token when the first one has expired", async () => {
    const getToken = vi.fn(async (options?: { skipCache?: boolean }) => (options?.skipCache ? "fresh" : "stale"));
    server.use(
      http.get(at("/api/credits"), ({ request }) =>
        request.headers.get("authorization") === "Bearer fresh"
          ? HttpResponse.json({ balance: 5, held: 0 })
          : HttpResponse.json({ error: "Token expired" }, { status: 401 }),
      ),
    );
    await expect(createApi(getToken).credits.get()).resolves.toEqual({ balance: 5, held: 0 });
    expect(getToken).toHaveBeenLastCalledWith({ skipCache: true });
  });

  it("reports a 401 after the single retry instead of looping", async () => {
    const requests = vi.fn();
    server.use(http.get(at("/api/credits"), () => (requests(), HttpResponse.json({ error: "Nope" }, { status: 401 }))));
    const getToken = async (options?: { skipCache?: boolean }) => (options?.skipCache ? "fresh" : "stale");
    expect((await failure(createApi(getToken).credits.get())).status).toBe(401);
    expect(requests).toHaveBeenCalledTimes(2);
  });

  it("does not retry when the fresh token is the same one", async () => {
    const requests = vi.fn();
    server.use(http.get(at("/api/credits"), () => (requests(), HttpResponse.json({ error: "Nope" }, { status: 401 }))));
    expect((await failure(api.credits.get())).status).toBe(401);
    expect(requests).toHaveBeenCalledTimes(1);
  });
});

describe("messages", () => {
  it("pages back through a long conversation, newest page first", async () => {
    const all = getMockDb().messages["chat-apple"];
    for (let i = 0; i < 118; i++) {
      all.push({ ...all[0], id: `extra-${i}`, createdAt: new Date(Date.now() + i).toISOString() });
    }

    const first = await api.messages.list("chat-apple");
    expect(first.messages).toHaveLength(PAGE_SIZE);
    expect(first.messages.at(-1)?.id).toBe("extra-117");

    const second = await api.messages.list("chat-apple", first.cursor);
    const third = await api.messages.list("chat-apple", second.cursor);
    expect(second.messages).toHaveLength(PAGE_SIZE);
    expect(third.messages).toHaveLength(20);
    expect(third.cursor).toBeNull();

    const ids = [...third.messages, ...second.messages, ...first.messages].map((m) => m.id);
    expect(ids).toEqual(all.map((m) => m.id));
  });

  it("rejects an empty message", async () => {
    expect(await failure(api.messages.send("chat-greeting", { content: "   ", clientMessageId: uuid() }))).toMatchObject({ status: 400, code: "VALIDATION_FAILED", message: "Message can't be empty." });
  });

  it("starts a run and names a new chat after its first message", async () => {
    const { chat } = await api.chats.create();
    expect(chat.title).toBe("New chat");

    const sent = await api.messages.send(chat.id, { content: "Plan a trip to Lisbon", clientMessageId: uuid() });
    expect(sent.message.role).toBe("USER");
    expect(sent.triggerRunId).toContain(sent.runId);

    const { chats } = await api.chats.list();
    expect(chats[0]).toMatchObject({ id: chat.id, title: "Plan a trip to Lisbon" });

    const active = await api.runs.getActive(chat.id);
    expect(active.run?.id).toBe(sent.runId);
  });

  it("stops reporting a run once it is cancelled", async () => {
    const { chat } = await api.chats.create();
    const { runId } = await api.messages.send(chat.id, { content: "hello", clientMessageId: uuid() });
    await api.runs.cancel(runId);
    expect((await api.runs.getActive(chat.id)).run).toBeNull();
  });
});

describe("sending safely", () => {
  it("stores the client id on the message, so the UI can match its optimistic copy", async () => {
    const clientMessageId = uuid();
    const sent = await api.messages.send("chat-greeting", { content: "hi", clientMessageId });
    expect(sent.message.clientMessageId).toBe(clientMessageId);
  });

  it("never creates a second message when the same send is repeated", async () => {
    const input = { content: "retry me", clientMessageId: uuid() };
    const first = await api.messages.send("chat-greeting", input);
    const again = await api.messages.send("chat-greeting", input);

    expect(again.runId).toBe(first.runId);
    const { messages } = await api.messages.list("chat-greeting");
    expect(messages.filter((m) => m.content === "retry me")).toHaveLength(1);
  });

  it("treats the same client id in another chat as a new message", async () => {
    const shared = uuid();
    const a = await api.messages.send("chat-greeting", { content: "x", clientMessageId: shared });
    const b = await api.messages.send("chat-apple", { content: "x", clientMessageId: shared });
    expect(b.runId).not.toBe(a.runId);
  });

  it("refuses a second message while a response is still being generated", async () => {
    await api.messages.send("chat-greeting", { content: "one", clientMessageId: uuid() });
    expect(await failure(api.messages.send("chat-greeting", { content: "two", clientMessageId: uuid() }))).toMatchObject({
      status: 409,
      code: "RUN_ACTIVE",
      message: "A response is already being generated",
    });
  });
});

describe("a run over time", () => {
  it("streams partial text, then lands the reply in the conversation", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await api.messages.send("chat-greeting", { content: "go", clientMessageId: uuid() });

    vi.advanceTimersByTime(RUN_MS * 0.3);
    const early = await api.runs.getActive("chat-greeting");
    // thinking first, then a step that is still running, before any text
    expect(early.partialBlocks.map((b) => b.type)).toEqual(["thinking", "tool_call"]);
    expect(early.partialText).toBeNull();

    vi.advanceTimersByTime(RUN_MS * 0.45);
    const midway = await api.runs.getActive("chat-greeting");
    expect(midway.run?.status).toBe("RUNNING");
    expect(midway.partialText?.length).toBeGreaterThan(0);
    expect(midway.partialText?.length).toBeLessThan(MOCK_REPLY.length);

    vi.advanceTimersByTime(RUN_MS);
    expect((await api.runs.getActive("chat-greeting")).run).toBeNull();
    const { messages } = await api.messages.list("chat-greeting");
    expect(messages.at(-1)).toMatchObject({ role: "ASSISTANT", content: MOCK_REPLY });
  });

  it("allows a new message once the run has finished", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await api.messages.send("chat-greeting", { content: "one", clientMessageId: uuid() });
    vi.advanceTimersByTime(RUN_MS + 1);
    await expect(api.messages.send("chat-greeting", { content: "two", clientMessageId: uuid() })).resolves.toHaveProperty("runId");
  });

  it("answers with a 4xx when Stop is pressed just as the run finished", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { runId } = await api.messages.send("chat-greeting", { content: "go", clientMessageId: uuid() });
    vi.advanceTimersByTime(RUN_MS + 1);
    expect(await failure(api.runs.cancel(runId))).toMatchObject({ status: 404, code: "NOT_FOUND" });
  });

  it("forgets a chat's messages and run when the chat is deleted", async () => {
    await api.messages.send("chat-greeting", { content: "go", clientMessageId: uuid() });
    await api.chats.delete("chat-greeting");
    expect(await failure(api.messages.list("chat-greeting"))).toMatchObject({ status: 404 });
    expect(await failure(api.runs.getActive("chat-greeting"))).toMatchObject({ status: 404 });
  });
});

describe("chats", () => {
  it("deletes a chat and then reports it missing", async () => {
    await expect(api.chats.delete("chat-greeting")).resolves.toBeUndefined();
    expect((await api.chats.list()).chats.map((c) => c.id)).toEqual(["chat-apple"]);
    expect((await failure(api.chats.delete("chat-greeting"))).status).toBe(404);
  });
});

describe("the chat list", () => {
  const manyChats = (count: number, pinned: string[] = []) => {
    const base = getMockDb().chats[0];
    getMockDb().chats = Array.from({ length: count }, (_, i) => ({
      ...base,
      id: `t${i}`,
      title: `Task ${i}`,
      isPinned: pinned.includes(`t${i}`),
      lastMessageAt: new Date(2026, 0, 1, 0, i).toISOString(),
    }));
  };

  it("comes a page at a time, in the order the server chose, with a cursor until the end", async () => {
    manyChats(120);
    const first = await api.chats.list();
    expect(first.chats).toHaveLength(50);
    expect(first.chats[0].id).toBe("t119"); // newest first
    expect(first.cursor).not.toBeNull();

    const second = await api.chats.list(first.cursor);
    const third = await api.chats.list(second.cursor);
    expect(second.chats).toHaveLength(50);
    expect(third.chats).toHaveLength(20);
    expect(third.cursor).toBeNull();
    expect(new Set([...first.chats, ...second.chats, ...third.chats].map((c) => c.id)).size).toBe(120);
  });

  it("lists pinned chats first", async () => {
    manyChats(5, ["t0"]);
    const { chats } = await api.chats.list();
    expect(chats.map((c) => c.id)).toEqual(["t0", "t4", "t3", "t2", "t1"]);
  });

  it("has no cursor when everything fits on one page", async () => {
    expect((await api.chats.list()).cursor).toBeNull();
  });

  it("rejects a cursor the server can't read", async () => {
    server.use(http.get(at("/api/chats"), () => HttpResponse.json({ error: "Bad cursor", code: "VALIDATION_FAILED" }, { status: 400 })));
    expect(await failure(api.chats.list("junk"))).toMatchObject({ status: 400, code: "VALIDATION_FAILED" });
  });
});

describe("one chat", () => {
  it("fetches a chat directly", async () => {
    const { chat } = await api.chats.get("chat-greeting");
    expect(chat).toMatchObject({ id: "chat-greeting", title: "Greeting", isPinned: false });
  });

  it("reports a missing chat as 404 NOT_FOUND", async () => {
    expect(await failure(api.chats.get("nope"))).toMatchObject({ status: 404, code: "NOT_FOUND" });
  });

  it("escapes the id in the path", async () => {
    let path = "";
    server.use(http.get(at("/api/chats/*"), ({ request }) => ((path = new URL(request.url).pathname), HttpResponse.json({ error: "x", code: "NOT_FOUND" }, { status: 404 }))));
    await failure(api.chats.get("a b?x"));
    expect(path).toBe("/api/chats/a%20b%3Fx");
  });
});

describe("creating a chat", () => {
  it("lets the server name it when you give no title", async () => {
    const { chat } = await api.chats.create();
    expect(chat.title).toBe("New chat");
    expect(chat.isPinned).toBe(false);
  });

  it("uses the title you give", async () => {
    expect((await api.chats.create("Trip to Lisbon")).chat.title).toBe("Trip to Lisbon");
  });

  it("is refused for a title the backend would reject", async () => {
    expect(await failure(api.chats.create("x".repeat(201)))).toMatchObject({ status: 400, code: "VALIDATION_FAILED" });
  });
});

describe("what the backend refuses to accept", () => {
  it("rejects a message over 32,000 characters and accepts exactly 32,000", async () => {
    expect(await failure(api.messages.send("chat-greeting", { content: "x".repeat(32_001), clientMessageId: uuid() }))).toMatchObject({
      status: 400,
      code: "VALIDATION_FAILED",
    });
    await expect(api.messages.send("chat-greeting", { content: "x".repeat(32_000), clientMessageId: uuid() })).resolves.toHaveProperty("runId");
  });

  it("rejects a client message id that isn't a UUID", async () => {
    expect(await failure(api.messages.send("chat-greeting", { content: "hi", clientMessageId: "not-a-uuid" }))).toMatchObject({
      status: 400,
      code: "VALIDATION_FAILED",
    });
  });

  it("keeps the indentation of a message exactly as typed", async () => {
    const code = "  if (x) {\n    run();\n  }\n";
    const { message } = await api.messages.send("chat-greeting", { content: code, clientMessageId: uuid() });
    expect(message.content).toBe(code);
  });

  it("rejects attachments that aren't http(s) links", async () => {
    server.use(http.post(at("/api/chats/:chatId/messages"), () => HttpResponse.json({ error: "bad", code: "VALIDATION_FAILED" }, { status: 400 })));
    expect(await failure(api.messages.send("chat-greeting", { content: "hi", clientMessageId: uuid(), attachments: ["javascript:alert(1)"] }))).toMatchObject({ status: 400 });
  });
});

describe("retrying a reply (mock backend, matching the backend's rules)", () => {
  const rawRetry = (runId: string) =>
    fetch(`${BACKEND_URL}/api/runs/${runId}/retry`, { method: "POST", headers: { Authorization: "Bearer test-token" } });

  it("starts a new run for the latest failed reply (201), and answers a repeat with the same run (200)", async () => {
    addRetryChat(getMockDb());
    const first = await rawRetry("run-failed");
    expect(first.status).toBe(201);
    const again = await rawRetry("run-failed");
    expect(again.status).toBe(200);
    const [a, b] = [await first.json(), await again.json()];
    expect(b.runId).toBe(a.runId);
    // the question is answered again; no new message is created
    expect(a.message.content).toBe("Summarise today's news in two lines");
    expect(getMockDb().messages["chat-failed"]).toHaveLength(2);
  });

  it("parses the answer with the contract", async () => {
    addRetryChat(getMockDb());
    const response = await api.runs.retry("run-failed");
    expect(response).toMatchObject({ chatId: "chat-failed", realtimeToken: "mock-realtime-token" });
  });

  it("marks only the latest failed reply as retryable, and not while a run is going", async () => {
    addRetryChat(getMockDb());
    const before = await api.messages.list("chat-failed");
    expect(before.messages.map((m) => m.canRetry)).toEqual([false, true]);
    await api.runs.retry("run-failed");
    const during = await api.messages.list("chat-failed");
    expect(during.messages.every((m) => !m.canRetry)).toBe(true);
  });

  it("refuses with the backend's codes", async () => {
    addRetryChat(getMockDb());
    // a reply that isn't failed or stopped
    await expect(api.runs.retry("run-nope")).rejects.toMatchObject({ status: 404 });
    getMockDb().messages["chat-greeting"][1].agentRunId = "run-done";
    await expect(api.runs.retry("run-done")).rejects.toMatchObject({ status: 409, code: "RUN_NOT_RETRYABLE" });
    // something is already running in the chat
    const now = new Date().toISOString();
    getMockDb().runs["chat-failed"] = { id: "run-busy", chatId: "chat-failed", triggerRunId: null, status: "RUNNING", startedAt: now, completedAt: null };
    await expect(api.runs.retry("run-failed")).rejects.toMatchObject({ status: 409, code: "RUN_ACTIVE" });
  });
});

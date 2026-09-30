import { delay, http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApi } from "@/lib/api";
import { BACKEND_URL } from "@/lib/config";
import { ApiError } from "@/lib/queryClient";
import { getMockDb, PAGE_SIZE } from "../mocks/fixtures";
import { MOCK_REPLY, RUN_MS } from "../mocks/handlers";
import { server } from "../mocks/server";

const at = (path: string) => `${BACKEND_URL}${path}`;
const api = createApi(async () => "test-token");

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

  it("uses the backend's error message", async () => {
    const error = await failure(api.messages.list("missing-chat"));
    expect(error).toMatchObject({ status: 404, message: "Chat not found" });
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
    const pending = api.chats.list(controller.signal);
    controller.abort();
    await expect(pending).rejects.not.toBeInstanceOf(ApiError);
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
    const error = await failure(impatient.chats.list(new AbortController().signal));
    expect(error.message).toBe("The server took too long to respond.");
  });

  it("does not need AbortSignal.any (Safari before 17.4)", async () => {
    const original = AbortSignal.any;
    // @ts-expect-error simulating a browser without the API
    delete AbortSignal.any;
    try {
      await expect(api.chats.list(new AbortController().signal)).resolves.toHaveProperty("chats");
      const controller = new AbortController();
      server.use(never);
      const pending = api.chats.list(controller.signal);
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
    await expect(api.chats.list(controller.signal)).rejects.not.toBeInstanceOf(ApiError);
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
    expect(await failure(api.messages.send("chat-greeting", { content: "   ", clientMessageId: "c-empty" }))).toMatchObject({ status: 400, message: "Message is empty" });
  });

  it("starts a run and names a new chat after its first message", async () => {
    const { chat } = await api.chats.create();
    expect(chat.title).toBe("New chat");

    const sent = await api.messages.send(chat.id, { content: "Plan a trip to Lisbon", clientMessageId: "c-lisbon" });
    expect(sent.message.role).toBe("USER");
    expect(sent.triggerRunId).toContain(sent.runId);

    const { chats } = await api.chats.list();
    expect(chats[0]).toMatchObject({ id: chat.id, title: "Plan a trip to Lisbon" });

    const active = await api.runs.getActive(chat.id);
    expect(active.run?.id).toBe(sent.runId);
  });

  it("stops reporting a run once it is cancelled", async () => {
    const { chat } = await api.chats.create();
    const { runId } = await api.messages.send(chat.id, { content: "hello", clientMessageId: "c-hello" });
    await api.runs.cancel(runId);
    expect((await api.runs.getActive(chat.id)).run).toBeNull();
  });
});

describe("sending safely", () => {
  it("stores the client id on the message, so the UI can match its optimistic copy", async () => {
    const sent = await api.messages.send("chat-greeting", { content: "hi", clientMessageId: "client-1" });
    expect(sent.message.clientMessageId).toBe("client-1");
  });

  it("never creates a second message when the same send is repeated", async () => {
    const input = { content: "retry me", clientMessageId: "client-2" };
    const first = await api.messages.send("chat-greeting", input);
    const again = await api.messages.send("chat-greeting", input);

    expect(again.runId).toBe(first.runId);
    const { messages } = await api.messages.list("chat-greeting");
    expect(messages.filter((m) => m.content === "retry me")).toHaveLength(1);
  });

  it("treats the same client id in another chat as a new message", async () => {
    const a = await api.messages.send("chat-greeting", { content: "x", clientMessageId: "shared" });
    const b = await api.messages.send("chat-apple", { content: "x", clientMessageId: "shared" });
    expect(b.runId).not.toBe(a.runId);
  });

  it("refuses a second message while a response is still being generated", async () => {
    await api.messages.send("chat-greeting", { content: "one", clientMessageId: "a" });
    expect(await failure(api.messages.send("chat-greeting", { content: "two", clientMessageId: "b" }))).toMatchObject({
      status: 409,
      message: "A response is already being generated",
    });
  });
});

describe("a run over time", () => {
  it("streams partial text, then lands the reply in the conversation", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await api.messages.send("chat-greeting", { content: "go", clientMessageId: "t-1" });

    vi.advanceTimersByTime(RUN_MS / 2);
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
    await api.messages.send("chat-greeting", { content: "one", clientMessageId: "a" });
    vi.advanceTimersByTime(RUN_MS + 1);
    await expect(api.messages.send("chat-greeting", { content: "two", clientMessageId: "b" })).resolves.toHaveProperty("runId");
  });

  it("answers 409 when Stop is pressed just as the run finished", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { runId } = await api.messages.send("chat-greeting", { content: "go", clientMessageId: "t-2" });
    vi.advanceTimersByTime(RUN_MS + 1);
    expect(await failure(api.runs.cancel(runId))).toMatchObject({ status: 409 });
  });

  it("forgets a chat's messages and run when the chat is deleted", async () => {
    await api.messages.send("chat-greeting", { content: "go", clientMessageId: "t-3" });
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

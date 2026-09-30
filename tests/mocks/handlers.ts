import { http, HttpResponse } from "msw";
import {
  CreateChatBodySchema,
  CursorQuerySchema,
  SendMessageBodySchema,
  type Chat,
  type ErrorCode,
  type Message,
} from "@/contracts";
import { BACKEND_URL } from "@/lib/config";
import { truncate } from "@/lib/utils";
import { getMockDb, MOCK_USER_ID } from "./fixtures";

// A mock run "streams" for this long, then the assistant reply lands in the conversation.
export const RUN_MS = 4000;
export const MOCK_REPLY = "Sure! This answer comes from the mock backend, so you can see how a run streams in.";

const url = (path: string) => `${BACKEND_URL}${path}`;
const isAuthed = (request: Request) => request.headers.get("authorization")?.startsWith("Bearer ");
// Errors use the backend's shape: { error, code }.
const fail = (status: number, code: ErrorCode, error: string) => HttpResponse.json({ error, code }, { status });
const unauthorized = () => fail(401, "UNAUTHORIZED", "Unauthorized");
const notFound = (what: string) => fail(404, "NOT_FOUND", `${what} not found`);
const newId = (prefix: string) => `${prefix}-${getMockDb().nextId++}`;

// The cursor is opaque to clients; here it is just an offset into the sorted list.
function queryOf(request: Request) {
  return CursorQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
}

// Pinned chats first, then the most recent activity, as the backend's contract says.
function sortedChats() {
  const activity = (chat: Chat) => Date.parse(chat.lastMessageAt ?? chat.createdAt);
  return [...getMockDb().chats].sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || activity(b) - activity(a));
}

// Runs finish lazily: whoever looks at a run after its time is up completes it. No timers, so
// nothing leaks between tests and the result only depends on the clock.
function settleRun(chatId: string) {
  const db = getMockDb();
  const run = db.runs[chatId];
  if (!run || run.status !== "RUNNING" || !run.startedAt) return run;
  if (Date.now() - Date.parse(run.startedAt) < RUN_MS) return run;

  const now = new Date().toISOString();
  run.status = "COMPLETED";
  run.completedAt = now;
  db.messages[chatId].push({
    id: newId("m"),
    chatId,
    role: "ASSISTANT",
    content: MOCK_REPLY,
    contentBlocks: [{ type: "text", content: MOCK_REPLY }],
    status: "COMPLETED",
    createdAt: now,
    agentRunId: run.id,
  });
  const chat = db.chats.find((c) => c.id === chatId);
  if (chat) chat.lastMessageAt = chat.updatedAt = now;
  return run;
}

const tokenExpiry = () => new Date(Date.now() + 5 * 60_000).toISOString();

export const handlers = [
  http.get(url("/api/chats"), ({ request }) => {
    if (!isAuthed(request)) return unauthorized();
    const query = queryOf(request);
    if (!query.success) return fail(400, "VALIDATION_FAILED", query.error.issues[0].message);

    const all = sortedChats();
    const start = Number(query.data.cursor ?? 0);
    const end = start + query.data.limit;
    return HttpResponse.json({ chats: all.slice(start, end), cursor: end < all.length ? String(end) : null });
  }),

  http.post(url("/api/chats"), async ({ request }) => {
    if (!isAuthed(request)) return unauthorized();
    const body = CreateChatBodySchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return fail(400, "VALIDATION_FAILED", body.error.issues[0].message);

    const now = new Date().toISOString();
    const chat: Chat = {
      id: newId("chat"),
      title: body.data.title ?? "New chat",
      userId: MOCK_USER_ID,
      isPinned: false,
      createdAt: now,
      updatedAt: now,
      lastMessageAt: now,
    };
    const db = getMockDb();
    db.chats.push(chat);
    db.messages[chat.id] = [];
    return HttpResponse.json({ chat });
  }),

  http.get(url("/api/chats/:chatId"), ({ request, params }) => {
    if (!isAuthed(request)) return unauthorized();
    const chat = getMockDb().chats.find((c) => c.id === params.chatId);
    return chat ? HttpResponse.json({ chat }) : notFound("Chat");
  }),

  http.delete(url("/api/chats/:chatId"), ({ request, params }) => {
    if (!isAuthed(request)) return unauthorized();
    const db = getMockDb();
    const chatId = params.chatId as string;
    if (!db.chats.some((chat) => chat.id === chatId)) return notFound("Chat");
    db.chats = db.chats.filter((chat) => chat.id !== chatId);
    delete db.messages[chatId];
    delete db.runs[chatId];
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(url("/api/chats/:chatId/messages"), ({ request, params }) => {
    if (!isAuthed(request)) return unauthorized();
    const chatId = params.chatId as string;
    if (!getMockDb().messages[chatId]) return notFound("Chat");
    const query = queryOf(request);
    if (!query.success) return fail(400, "VALIDATION_FAILED", query.error.issues[0].message);

    settleRun(chatId);
    const all = getMockDb().messages[chatId];
    // the cursor is the index of the oldest message already sent; pages run back in time
    const end = Number(query.data.cursor ?? all.length);
    const start = Math.max(0, end - query.data.limit);
    return HttpResponse.json({ messages: all.slice(start, end), cursor: start > 0 ? String(start) : null });
  }),

  http.post(url("/api/chats/:chatId/messages"), async ({ request, params }) => {
    if (!isAuthed(request)) return unauthorized();
    const db = getMockDb();
    const chatId = params.chatId as string;
    const chat = db.chats.find((c) => c.id === chatId);
    if (!chat) return notFound("Chat");

    // the backend's own schema decides what is acceptable: non-blank, at most 32,000 characters, a UUID client id
    const body = SendMessageBodySchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return fail(400, "VALIDATION_FAILED", body.error.issues[0].message);
    const { content, clientMessageId } = body.data;

    const dedupeKey = clientMessageId ? `${chatId}:${clientMessageId}` : null;
    if (dedupeKey && db.sent[dedupeKey]) return HttpResponse.json(db.sent[dedupeKey]);
    if (settleRun(chatId)?.status === "RUNNING") {
      return fail(409, "RUN_ACTIVE", "A response is already being generated");
    }

    const now = new Date().toISOString();
    const runId = newId("run");
    const message: Message = {
      id: newId("m"),
      chatId,
      role: "USER",
      content,
      contentBlocks: [],
      status: "COMPLETED",
      createdAt: now,
      agentRunId: runId,
      clientMessageId: clientMessageId ?? null,
    };
    db.messages[chatId].push(message);
    chat.lastMessageAt = chat.updatedAt = now;
    // like the real backend, name a new chat after its first message
    if (chat.title === "New chat") chat.title = truncate(content.trim(), 50);

    const triggerRunId = `trigger-${runId}`;
    db.runs[chatId] = { id: runId, chatId, triggerRunId, status: "RUNNING", startedAt: now, completedAt: null };
    const response = { message, chatId, runId, triggerRunId, realtimeToken: "mock-realtime-token", realtimeTokenExpiresAt: tokenExpiry() };
    if (dedupeKey) db.sent[dedupeKey] = response;
    return HttpResponse.json(response);
  }),

  http.get(url("/api/chats/:chatId/active-run"), ({ request, params }) => {
    if (!isAuthed(request)) return unauthorized();
    const db = getMockDb();
    const chatId = params.chatId as string;
    if (!db.chats.some((chat) => chat.id === chatId)) return notFound("Chat");

    const run = settleRun(chatId);
    if (run?.status !== "RUNNING" || !run.startedAt) {
      return HttpResponse.json({ run: null, realtimeToken: null, realtimeTokenExpiresAt: null, partialText: null, partialBlocks: [] });
    }
    // text grows with elapsed time, like a real stream would
    const progress = Math.min(1, (Date.now() - Date.parse(run.startedAt)) / RUN_MS);
    const partialText = MOCK_REPLY.slice(0, Math.floor(MOCK_REPLY.length * progress));
    return HttpResponse.json({
      run,
      realtimeToken: "mock-realtime-token",
      realtimeTokenExpiresAt: tokenExpiry(),
      partialText,
      partialBlocks: partialText ? [{ type: "text", content: partialText }] : [],
    });
  }),

  http.post(url("/api/runs/:runId/cancel"), ({ request, params }) => {
    if (!isAuthed(request)) return unauthorized();
    const run = Object.values(getMockDb().runs).find((r) => r.id === params.runId);
    if (!run) return notFound("Run");
    settleRun(run.chatId);
    // Stop pressed just as the run finished. What the real backend answers is not decided yet, so the
    // client must treat any 4xx here as "look again", not as a failure.
    if (run.status !== "RUNNING") return notFound("Active run");
    run.status = "CANCELLED";
    run.completedAt = new Date().toISOString();
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(url("/api/credits"), ({ request }) => {
    if (!isAuthed(request)) return unauthorized();
    return HttpResponse.json(getMockDb().credits);
  }),
];

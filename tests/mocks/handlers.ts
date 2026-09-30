import { http, HttpResponse } from "msw";
import { BACKEND_URL } from "@/lib/config";
import { truncate } from "@/lib/utils";
import type { Message } from "@/types";
import { getMockDb, MOCK_USER_ID, PAGE_SIZE } from "./fixtures";

// A mock run "streams" for this long, then the assistant reply lands in the conversation.
export const RUN_MS = 4000;
export const MOCK_REPLY = "Sure! This answer comes from the mock backend, so you can see how a run streams in.";

const url = (path: string) => `${BACKEND_URL}${path}`;
const isAuthed = (request: Request) => request.headers.get("authorization")?.startsWith("Bearer ");
const unauthorized = () => HttpResponse.json({ error: "Unauthorized" }, { status: 401 });
const notFound = (what: string) => HttpResponse.json({ error: `${what} not found` }, { status: 404 });
const newId = (prefix: string) => `${prefix}-${getMockDb().nextId++}`;

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
    const chats = [...getMockDb().chats].sort((a, b) => (b.lastMessageAt ?? b.createdAt).localeCompare(a.lastMessageAt ?? a.createdAt));
    return HttpResponse.json({ chats });
  }),

  http.post(url("/api/chats"), async ({ request }) => {
    if (!isAuthed(request)) return unauthorized();
    const body = (await request.json().catch(() => ({}))) as { title?: string };
    const now = new Date().toISOString();
    const chat = { id: newId("chat"), title: body.title || "New chat", userId: MOCK_USER_ID, createdAt: now, updatedAt: now, lastMessageAt: null };
    const db = getMockDb();
    db.chats.push(chat);
    db.messages[chat.id] = [];
    return HttpResponse.json({ chat });
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
    settleRun(chatId);
    const all = getMockDb().messages[chatId];
    // the cursor is the index of the oldest message already sent
    const end = Number(new URL(request.url).searchParams.get("cursor") ?? all.length);
    const start = Math.max(0, end - PAGE_SIZE);
    return HttpResponse.json({ messages: all.slice(start, end), cursor: start > 0 ? String(start) : null });
  }),

  http.post(url("/api/chats/:chatId/messages"), async ({ request, params }) => {
    if (!isAuthed(request)) return unauthorized();
    const db = getMockDb();
    const chatId = params.chatId as string;
    const chat = db.chats.find((c) => c.id === chatId);
    if (!chat) return notFound("Chat");

    const body = (await request.json().catch(() => ({}))) as { content?: string; clientMessageId?: string };
    const content = body.content?.trim();
    if (!content) return HttpResponse.json({ error: "Message is empty" }, { status: 400 });

    const dedupeKey = body.clientMessageId ? `${chatId}:${body.clientMessageId}` : null;
    if (dedupeKey && db.sent[dedupeKey]) return HttpResponse.json(db.sent[dedupeKey]);
    if (settleRun(chatId)?.status === "RUNNING") {
      return HttpResponse.json({ error: "A response is already being generated" }, { status: 409 });
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
      clientMessageId: body.clientMessageId ?? null,
    };
    db.messages[chatId].push(message);
    chat.lastMessageAt = chat.updatedAt = now;
    // like the real backend, name a new chat after its first message
    if (chat.title === "New chat") chat.title = truncate(content, 50);

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
    // Stop pressed just as the run finished: the real backend answers 409 too
    if (run.status !== "RUNNING") return HttpResponse.json({ error: "Run has already finished" }, { status: 409 });
    run.status = "CANCELLED";
    run.completedAt = new Date().toISOString();
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(url("/api/credits"), ({ request }) => {
    if (!isAuthed(request)) return unauthorized();
    return HttpResponse.json(getMockDb().credits);
  }),
];

import { http, HttpResponse } from "msw";
import {
  ChatSearchQuerySchema,
  CompleteUploadBodySchema,
  CreateChatBodySchema,
  CreateUploadsBodySchema,
  MediaListQuerySchema,
  UPLOAD_LIFETIME_MS,
  UpdateChatBodySchema,
  CursorQuerySchema,
  SendMessageBodySchema,
  type Chat,
  type ContentBlock,
  type ErrorCode,
  type MediaAsset,
  type Message,
} from "@/contracts";
import { BACKEND_URL } from "@/lib/config";
import { truncate } from "@/lib/utils";
import { getMockDb, MOCK_AUDIO, MOCK_USER_ID } from "./fixtures";

// A mock run "streams" for this long, then the assistant reply lands in the conversation.
export const RUN_MS = 4000;
export const MOCK_REPLY = "Sure! This answer comes from the mock backend, so you can see how a run streams in.";

// What the last question asked for decides what a mock run does, so each kind of tool can be tried out:
// a picture (gpt_image_2), a crop (crop_image), a merge (merge_videos, which ends with no text: the video is
// the answer), a failing step ("fail"), or a sound clip.
const lastAsk = (chatId: string) => [...(getMockDb().messages[chatId] ?? [])].reverse().find((m) => m.role === "USER")?.content ?? "";

export interface MockAsk {
  image: boolean;
  crop: boolean;
  merge: boolean;
  fail: boolean;
  audio: boolean;
}

export function mockAsk(chatId: string): MockAsk {
  const text = lastAsk(chatId);
  return {
    image: /\b(image|picture|draw|photo|poster)\b/i.test(text),
    crop: /\bcrop/i.test(text),
    merge: /\b(merge|clips?|videos?)\b/i.test(text),
    fail: /\bfail/i.test(text),
    audio: /\b(audio|sound|voice|music|song)\b/i.test(text),
  };
}

const MOCK_IMAGE: ContentBlock = {
  type: "image",
  url: "/mock/red-apple.svg",
  altText: "A red apple",
  prompt: "A single red apple on a white table, soft light",
  model: "GPT Image 2",
  width: 1024,
  height: 1024,
};

// The one media step a mock run takes, if any: its tool, display input and result, and what it streams.
function mediaStep(ask: MockAsk) {
  if (ask.merge) {
    return {
      toolName: "merge_videos",
      skill: "video-editing",
      toolInput: { video_urls: ["https://cdn.example.com/clip-1.mp4", "https://cdn.example.com/clip-2.mp4"], transition: "fade" },
      result: { url: "/mock/merged.webm", mimeType: "video/webm", durationMs: 3500, width: 320, height: 180 },
      asset: { type: "video", url: "/mock/merged.webm", mimeType: "video/webm", altText: "The two clips, merged", model: "Merge Videos", width: 320, height: 180 } as ContentBlock,
      creditCost: 40_000,
    };
  }
  if (ask.crop) {
    return {
      toolName: "crop_image",
      skill: "image-generation",
      toolInput: { image_url: "https://cdn.example.com/red-apple.png", x_percent: 25, y_percent: 25, width_percent: 50, height_percent: 50 },
      result: { url: "/mock/red-apple.svg", width: 512, height: 512 },
      asset: { type: "image", url: "/mock/red-apple.svg", altText: "The apple, cropped", model: "Crop Image", width: 512, height: 512 } as ContentBlock,
      creditCost: 10_000,
    };
  }
  if (ask.image || ask.fail) {
    return {
      toolName: "gpt_image_2",
      skill: "image-generation",
      toolInput: { mode: "text", prompt: "A single red apple on a white table, soft light", size: "1024x1024", quality: "medium" },
      result: { url: "/mock/red-apple.svg", width: 1024, height: 1024, mimeType: "image/svg+xml" },
      asset: MOCK_IMAGE,
      creditCost: 70_000,
    };
  }
  return null;
}

export const MOCK_TOOL_ERROR = "The image service didn't answer in time. Please try again.";

// What a mock run has produced after `progress` (0 to 1) of its time, in the order the backend streams it:
// a short think, a skill load, then (when asked) a media step and its asset, then the reply text growing.
// The saved reply is the same blocks at 1.
export function mockRunBlocks(progress: number, ask: Partial<MockAsk> = {}): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  if (progress < 0.1) return blocks;
  blocks.push({ type: "thinking", content: "The user wants a quick answer. Keep it short.", ...(progress >= 0.25 && { durationMs: 900 }) });
  if (progress < 0.25) return blocks;

  const full: MockAsk = { image: false, crop: false, merge: false, fail: false, audio: false, ...ask };
  const media = mediaStep(full);
  const skill = media?.skill ?? "writing";
  const skillDone = progress >= 0.35;
  blocks.push({ type: "tool_call", toolCallId: "s1-MockSkill1", toolName: "load_skill", toolInput: { name: skill }, status: skillDone ? "completed" : "running", ...(skillDone && { durationMs: 1200 }) });
  if (skillDone) blocks.push({ type: "tool_result", toolCallId: "s1-MockSkill1", toolName: "load_skill", result: { skill, loaded: true }, isError: false });

  if (media && skillDone) {
    const done = progress >= 0.55;
    const failed = done && full.fail;
    blocks.push({
      type: "tool_call",
      toolCallId: "s1-MockMedia1",
      toolName: media.toolName,
      toolInput: media.toolInput,
      status: !done ? "running" : failed ? "failed" : "completed",
      ...(done && { durationMs: 2600 }),
      ...(done && !failed && { creditCost: media.creditCost }),
    });
    if (failed) blocks.push({ type: "tool_result", toolCallId: "s1-MockMedia1", toolName: media.toolName, isError: true, errorMessage: MOCK_TOOL_ERROR });
    else if (done) {
      blocks.push({ type: "tool_result", toolCallId: "s1-MockMedia1", toolName: media.toolName, result: media.result, isError: false });
      blocks.push(media.asset);
    }
  }

  // a merge ends on its video, with no final text
  if (!(full.merge && !full.fail)) {
    // at the end the whole reply (floating point would otherwise leave it a character short)
    const share = progress >= 1 ? 1 : Math.max(0, (progress - 0.55) / 0.45);
    const text = MOCK_REPLY.slice(0, Math.floor(MOCK_REPLY.length * share));
    if (text) blocks.push({ type: "text", content: text });
  }
  if (full.audio && progress >= 0.8) blocks.push(MOCK_AUDIO);
  return blocks;
}

// Like the backend: a turn stopped mid-tool shows that tool as failed, with "Stopped.".
function stopTools(blocks: ContentBlock[]): ContentBlock[] {
  const out: ContentBlock[] = [];
  for (const block of blocks) {
    if (block.type === "tool_call" && (block.status === "running" || block.status === "pending")) {
      out.push({ ...block, status: "failed" });
      out.push({ type: "tool_result", toolCallId: block.toolCallId, toolName: block.toolName, isError: true, errorMessage: "Stopped." });
    } else out.push(block);
  }
  return out;
}

const url = (path: string) => `${BACKEND_URL}${path}`;
const isAuthed = (request: Request) => request.headers.get("authorization")?.startsWith("Bearer ");
// Errors use the backend's shape: { error, code }.
const fail = (status: number, code: ErrorCode, error: string) => HttpResponse.json({ error, code }, { status });
const unauthorized = () => fail(401, "UNAUTHORIZED", "Unauthorized");
const notFound = (what: string) => fail(404, "NOT_FOUND", `${what} not found`);
const newId = (prefix: string) => `${prefix}-${getMockDb().nextId++}`;
// the backend names the field in a validation message: "q: Type at least 3 characters to search."
const fieldMessage = (issue: { path: PropertyKey[]; message: string }) =>
  issue.path.length > 0 ? `${issue.path.map(String).join(".")}: ${issue.message}` : issue.message;

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
  const blocks = mockRunBlocks(1, mockAsk(chatId));
  db.messages[chatId].push({
    id: newId("m"),
    chatId,
    role: "ASSISTANT",
    // a reply that ended on its tools' results has no text
    content: blocks.map((block) => (block.type === "text" ? block.content : "")).join(""),
    contentBlocks: blocks,
    status: "COMPLETED",
    createdAt: now,
    agentRunId: run.id,
  });
  const chat = db.chats.find((c) => c.id === chatId);
  if (chat) chat.lastMessageAt = chat.updatedAt = now;
  return run;
}

// Like the backend: only the chat's latest turn can be retried, and only when its reply failed or was
// stopped and nothing is running. Worked out on every read, so it always matches the current state.
function withRetry(chatId: string): Message[] {
  const db = getMockDb();
  const all = db.messages[chatId] ?? [];
  const last = all.at(-1);
  const running = db.runs[chatId]?.status === "RUNNING";
  return all.map((message) => ({
    ...message,
    // a file's expiry is worked out when the message is read
    ...(message.attachments ? { attachments: message.attachments.map((file) => ({ ...file, expired: isExpired(file) })) } : {}),
    canRetry: !running && message === last && message.role === "ASSISTANT" && (message.status === "FAILED" || message.status === "CANCELLED"),
  }));
}

const tokenExpiry = () => new Date(Date.now() + 5 * 60_000).toISOString();

// an upload the upload service has deleted (generated media never expires)
const isExpired = (asset: Pick<MediaAsset, "expiresAt">) => !!asset.expiresAt && Date.parse(asset.expiresAt) <= Date.now();
const kindOfMime = (mimeType: string): MediaAsset["type"] => (mimeType.startsWith("video/") ? "video" : mimeType.startsWith("audio/") ? "audio" : "image");

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

  // Like the backend: titles and message text, case ignored, as typed; one entry per chat, latest activity first
  // (pinned chats are not moved up); at least SEARCH_QUERY_MIN characters. Registered before /api/chats/:chatId,
  // which would otherwise take "search" for a chat id.
  http.get(url("/api/chats/search"), ({ request }) => {
    if (!isAuthed(request)) return unauthorized();
    const query = ChatSearchQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!query.success) return fail(400, "VALIDATION_FAILED", fieldMessage(query.error.issues[0]));

    const db = getMockDb();
    const needle = query.data.q.toLowerCase();
    const matches = (chat: Chat) =>
      chat.title.toLowerCase().includes(needle) || (db.messages[chat.id] ?? []).some((m) => (m.content ?? "").toLowerCase().includes(needle));
    const activity = (chat: Chat) => Date.parse(chat.lastMessageAt ?? chat.createdAt);
    const all = db.chats.filter(matches).sort((a, b) => activity(b) - activity(a));
    const start = Number(query.data.cursor ?? 0);
    const end = start + query.data.limit;
    return HttpResponse.json({ chats: all.slice(start, end), cursor: end < all.length ? String(end) : null });
  }),

  http.get(url("/api/chats/:chatId"), ({ request, params }) => {
    if (!isAuthed(request)) return unauthorized();
    const chat = getMockDb().chats.find((c) => c.id === params.chatId);
    return chat ? HttpResponse.json({ chat }) : notFound("Chat");
  }),

  // Like the backend: one signed Transloadit upload per file, in the order given. `params` is the JSON string signed.
  http.post(url("/api/uploads"), async ({ request }) => {
    if (!isAuthed(request)) return unauthorized();
    const body = CreateUploadsBodySchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return fail(400, "VALIDATION_FAILED", fieldMessage(body.error.issues[0]));
    const db = getMockDb();
    const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
    const uploads = body.data.files.map((file) => {
      const uploadId = newId("upload");
      db.uploads[uploadId] = { file, assetId: null };
      const params = JSON.stringify({ auth: { key: "mock-key", expires: expiresAt }, template_id: "mock-template", fields: { uploadId } });
      return { uploadId, params, signature: `sha384:${"0".repeat(96)}`, expiresAt };
    });
    return HttpResponse.json({ uploads });
  }),

  // The browser says the file reached the upload service; here it is always done, and the file goes into the
  // library. Asking again gives the same answer, as on the backend.
  http.post(url("/api/uploads/:uploadId/complete"), async ({ request, params }) => {
    if (!isAuthed(request)) return unauthorized();
    const db = getMockDb();
    const uploadId = params.uploadId as string;
    const upload = db.uploads[uploadId];
    if (!upload) return notFound("Upload");
    const body = CompleteUploadBodySchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return fail(400, "VALIDATION_FAILED", fieldMessage(body.error.issues[0]));
    if (!upload.assetId) {
      const now = Date.now();
      const type = kindOfMime(upload.file.mimeType);
      const asset: MediaAsset = {
        id: newId("media"),
        source: "upload",
        type,
        url: type === "audio" ? "/mock/chime.wav" : "/mock/red-apple.svg",
        name: upload.file.name,
        prompt: null,
        model: null,
        width: null,
        height: null,
        mimeType: upload.file.mimeType,
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + UPLOAD_LIFETIME_MS).toISOString(),
      };
      db.media.unshift(asset);
      upload.assetId = asset.id;
    }
    const asset = db.media.find((m) => m.id === upload.assetId) ?? null;
    return HttpResponse.json({ upload: { id: uploadId, status: "completed", errorMessage: null, asset } });
  }),

  // the media library: newest first, expired uploads left out, by source and by a search of names and prompts
  http.get(url("/api/media"), ({ request }) => {
    if (!isAuthed(request)) return unauthorized();
    const query = MediaListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!query.success) return fail(400, "VALIDATION_FAILED", fieldMessage(query.error.issues[0]));
    const { source, q, cursor, limit } = query.data;
    const live = getMockDb()
      .media.filter((asset) => !isExpired(asset))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const needle = q?.toLowerCase();
    const list = live.filter(
      (asset) =>
        (!source || asset.source === source) &&
        (!needle || (asset.name ?? "").toLowerCase().includes(needle) || (asset.prompt ?? "").toLowerCase().includes(needle)),
    );
    const start = Number(cursor ?? 0);
    const end = start + limit;
    return HttpResponse.json({ media: list.slice(start, end), cursor: end < list.length ? String(end) : null, total: live.length });
  }),

  // rename and/or pin
  http.patch(url("/api/chats/:chatId"), async ({ request, params }) => {
    if (!isAuthed(request)) return unauthorized();
    const chat = getMockDb().chats.find((c) => c.id === params.chatId);
    if (!chat) return notFound("Chat");
    const body = UpdateChatBodySchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return fail(400, "VALIDATION_FAILED", fieldMessage(body.error.issues[0]));

    if (body.data.title !== undefined) chat.title = body.data.title;
    if (body.data.isPinned !== undefined) chat.isPinned = body.data.isPinned;
    chat.updatedAt = new Date().toISOString();
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
    const query = queryOf(request);
    if (!query.success) return fail(400, "VALIDATION_FAILED", query.error.issues[0].message);

    settleRun(chatId);
    const all = withRetry(chatId);
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

    // each file must be in the user's library and not expired, as the backend checks
    const files: MediaAsset[] = [];
    for (const [index, { mediaAssetId }] of body.data.attachments.entries()) {
      const asset = db.media.find((m) => m.id === mediaAssetId);
      if (!asset) return fail(400, "VALIDATION_FAILED", `attachments.${index}: That file isn't in your library.`);
      if (isExpired(asset)) return fail(400, "VALIDATION_FAILED", `attachments.${index}: This file has expired. Upload it again.`);
      files.push(asset);
    }
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
      ...(files.length > 0 ? { attachments: files.map((asset) => ({ ...asset, expired: false })) } : {}),
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
    const partialBlocks = mockRunBlocks(progress, mockAsk(chatId));
    const partialText = partialBlocks.map((block) => (block.type === "text" ? block.content : "")).join("") || null;
    return HttpResponse.json({
      run,
      realtimeToken: "mock-realtime-token",
      realtimeTokenExpiresAt: tokenExpiry(),
      partialText,
      partialBlocks,
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
    // like the backend: the run ends at once and whatever was written so far is kept, marked as stopped
    const now = new Date().toISOString();
    const partial = stopTools(mockRunBlocks((Date.now() - Date.parse(run.startedAt ?? now)) / RUN_MS, mockAsk(run.chatId)));
    run.status = "CANCELLED";
    run.completedAt = now;
    getMockDb().messages[run.chatId]?.push({
      id: newId("m"),
      chatId: run.chatId,
      role: "ASSISTANT",
      content: partial.map((block) => (block.type === "text" ? block.content : "")).join(""),
      contentBlocks: partial,
      status: "CANCELLED",
      createdAt: now,
      agentRunId: run.id,
    });
    return new HttpResponse(null, { status: 204 });
  }),

  // Answers the same question again as a new turn that streams through the polling path. A repeated request
  // for the same failed reply (a double click) gets the first answer back with 200, as the backend does.
  http.post(url("/api/runs/:runId/retry"), ({ request, params }) => {
    if (!isAuthed(request)) return unauthorized();
    const db = getMockDb();
    const runId = params.runId as string;
    const chatId = Object.keys(db.messages).find((id) => db.messages[id].some((m) => m.role === "ASSISTANT" && m.agentRunId === runId));
    if (!chatId || !db.chats.some((chat) => chat.id === chatId)) return notFound("Run");

    const replay = db.sent[`retry:${runId}`];
    if (replay) return HttpResponse.json(replay, { status: 200 });
    if (settleRun(chatId)?.status === "RUNNING") return fail(409, "RUN_ACTIVE", "A response is already being generated");
    const last = db.messages[chatId].at(-1);
    const retryable = last?.role === "ASSISTANT" && last.agentRunId === runId && (last.status === "FAILED" || last.status === "CANCELLED");
    if (!retryable) return fail(409, "RUN_NOT_RETRYABLE", "Only the latest failed or stopped reply can be retried");

    const now = new Date().toISOString();
    const newRunId = newId("run");
    const triggerRunId = `trigger-${newRunId}`;
    db.runs[chatId] = { id: newRunId, chatId, triggerRunId, status: "RUNNING", startedAt: now, completedAt: null };
    // the question that is answered again: no new message is created
    const question = [...db.messages[chatId]].reverse().find((m) => m.role === "USER")!;
    const response = { message: question, chatId, runId: newRunId, triggerRunId, realtimeToken: "mock-realtime-token", realtimeTokenExpiresAt: tokenExpiry() };
    db.sent[`retry:${runId}`] = response;
    return HttpResponse.json(response, { status: 201 });
  }),

  http.get(url("/api/models"), ({ request }) => {
    if (!isAuthed(request)) return unauthorized();
    return HttpResponse.json(getMockDb().models);
  }),

  http.get(url("/api/credits"), ({ request }) => {
    if (!isAuthed(request)) return unauthorized();
    return HttpResponse.json(getMockDb().credits);
  }),
];

import type { AgentRun, Chat, ContentBlock, Credits, MediaAsset, Message, ModelsResponse, SendMessageResponse } from "@/types";
import type { UploadFile, Waitpoint } from "@/contracts";

export const MOCK_USER_ID = "user_mock";

// A short clip (public/mock/chime.wav) for replies that include audio.
export const MOCK_AUDIO: ContentBlock = {
  type: "audio",
  url: "/mock/chime.wav",
  mimeType: "audio/wav",
  altText: "A short chime",
  durationMs: 1500,
};

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const APPLE_PROMPT =
  "A single fresh red apple with a small stem and leaf, sitting on a clean white table, soft natural lighting, subtle shadow beneath the apple, minimalist composition, photorealistic";

// The real tools, with the display inputs and results the backend streams for them.
const appleBlocks: ContentBlock[] = [
  { type: "tool_call", toolCallId: "s1-LoadSkill01", toolName: "load_skill", toolInput: { name: "image-generation" }, status: "completed", durationMs: 1700 },
  { type: "tool_result", toolCallId: "s1-LoadSkill01", toolName: "load_skill", result: { skill: "image-generation", loaded: true }, isError: false },
  {
    type: "tool_call",
    toolCallId: "s1-ReadAsset01",
    toolName: "read_skill_asset",
    toolInput: { skill: "image-generation", path: "examples/presets.md" },
    status: "completed",
    durationMs: 400,
  },
  { type: "tool_result", toolCallId: "s1-ReadAsset01", toolName: "read_skill_asset", result: { skill: "image-generation", path: "examples/presets.md", characters: 1840 }, isError: false },
  {
    type: "tool_call",
    toolCallId: "s1-GptImage01",
    toolName: "gpt_image_2",
    toolInput: { mode: "text", prompt: APPLE_PROMPT, size: "1024x1024", quality: "high" },
    status: "completed",
    durationMs: 34_700,
    creditCost: 70_000,
  },
  {
    type: "tool_result",
    toolCallId: "s1-GptImage01",
    toolName: "gpt_image_2",
    result: { url: "/mock/red-apple.svg", width: 1024, height: 1024, mimeType: "image/svg+xml" },
    isError: false,
  },
  {
    type: "image",
    url: "/mock/red-apple.svg",
    altText: "A red apple on a white table",
    prompt: APPLE_PROMPT,
    model: "GPT Image 2",
    width: 1024,
    height: 1024,
  },
  { type: "text", content: "Here's your image: a red apple on a white table." },
  { type: "usage", inputTokens: 1200, outputTokens: 340, model: "openrouter/free", creditCost: 290_000 },
];

// A reply made only of tool work: a crop, a merge that made a video, and a step that failed. There is no
// final text; the media is the answer.
const toolsBlocks: ContentBlock[] = [
  { type: "tool_call", toolCallId: "s1-LoadSkill02", toolName: "load_skill", toolInput: { name: "video-editing" }, status: "completed", durationMs: 900 },
  { type: "tool_result", toolCallId: "s1-LoadSkill02", toolName: "load_skill", result: { skill: "video-editing", loaded: true }, isError: false },
  {
    type: "tool_call",
    toolCallId: "s1-CropImage01",
    toolName: "crop_image",
    toolInput: { image_url: "https://cdn.example.com/red-apple.png", x_percent: 25, y_percent: 25, width_percent: 50, height_percent: 50 },
    status: "completed",
    durationMs: 2100,
    creditCost: 10_000,
  },
  { type: "tool_result", toolCallId: "s1-CropImage01", toolName: "crop_image", result: { url: "/mock/red-apple.svg", width: 512, height: 512 }, isError: false },
  {
    type: "tool_call",
    toolCallId: "s1-MergeVids01",
    toolName: "merge_videos",
    toolInput: { video_urls: ["https://cdn.example.com/clip-1.mp4", "https://cdn.example.com/clip-2.mp4"], transition: "fade" },
    status: "completed",
    durationMs: 8400,
    creditCost: 40_000,
  },
  {
    type: "tool_result",
    toolCallId: "s1-MergeVids01",
    toolName: "merge_videos",
    result: { url: "/mock/merged.webm", mimeType: "video/webm", durationMs: 3500, width: 320, height: 180 },
    isError: false,
  },
  {
    type: "tool_call",
    toolCallId: "s1-GptImage02",
    toolName: "gpt_image_2",
    toolInput: { mode: "text", prompt: "A poster for the merged clip", size: "1024x1536" },
    status: "failed",
    durationMs: 30_000,
  },
  {
    type: "tool_result",
    toolCallId: "s1-GptImage02",
    toolName: "gpt_image_2",
    isError: true,
    errorMessage: "The image service didn't answer in time. Please try again.",
  },
  { type: "image", url: "/mock/red-apple.svg", altText: "The apple, cropped", model: "Crop Image", width: 512, height: 512 },
  { type: "video", url: "/mock/merged.webm", mimeType: "video/webm", altText: "The two clips, merged", model: "Merge Videos", width: 320, height: 180 },
];

function message(id: string, chatId: string, role: Message["role"], text: string, blocks: ContentBlock[], at: string): Message {
  return { id, chatId, role, content: text, contentBlocks: blocks, status: "COMPLETED", createdAt: at, agentRunId: null };
}

function chat(id: string, title: string, lastMessageMinutesAgo: number): Chat {
  return {
    id,
    title,
    userId: MOCK_USER_ID,
    isPinned: false,
    createdAt: minutesAgo(lastMessageMinutesAgo + 1),
    updatedAt: minutesAgo(lastMessageMinutesAgo),
    lastMessageAt: minutesAgo(lastMessageMinutesAgo),
  };
}

export interface MockDb {
  chats: Chat[];
  messages: Record<string, Message[]>;
  runs: Record<string, AgentRun>;
  // responses already given, keyed by chat and clientMessageId, so a retried send is not repeated
  sent: Record<string, SendMessageResponse>;
  credits: Credits;
  models: ModelsResponse;
  // the media library (uploads and generated media), and uploads signed but not yet in it
  media: MediaAsset[];
  uploads: Record<string, { file: UploadFile; assetId: string | null }>;
  // what runs wait on the user for, by id; and the plan-mode runs (by run id): the plans they asked about, in
  // order, and when one was approved
  waitpoints: Record<string, Waitpoint>;
  plans: Record<string, MockPlanRun>;
  // API keys as the backend stores them (revoked ones are kept, and never listed)
  apiKeys: MockApiKey[];
  nextId: number;
}

export interface MockApiKey {
  id: string;
  label: string;
  prefix: string;
  perMinute: number;
  perDay: number;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

// one key, made yesterday and used today
export const mockApiKey = (over: Partial<MockApiKey> = {}): MockApiKey => ({
  id: "key-1",
  label: "Default",
  prefix: "mgc_Hnz3gjhh",
  perMinute: 60,
  perDay: 1000,
  expiresAt: null,
  lastUsedAt: minutesAgo(30),
  createdAt: minutesAgo(24 * 60),
  revokedAt: null,
  ...over,
});

export interface MockPlanRun {
  chatId: string;
  waitpointIds: string[];
  approvedAt: number | null;
}

const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

// A small library: two generated pictures (today and two days ago) and two uploads (an image and a song).
function mediaFixtures(): MediaAsset[] {
  const generated = (id: string, prompt: string, url: string, minutes: number): MediaAsset => ({
    id, source: "generated", type: "image", url, name: null, prompt, model: "GPT Image 2", width: 1024, height: 1024, mimeType: "image/png", createdAt: minutesAgo(minutes), expiresAt: null,
  });
  const upload = (id: string, name: string, type: MediaAsset["type"], mimeType: string, url: string, minutes: number): MediaAsset => ({
    id, source: "upload", type, url, name, prompt: null, model: null, width: type === "image" ? 800 : null, height: type === "image" ? 600 : null, mimeType, createdAt: minutesAgo(minutes), expiresAt: hoursFromNow(23 - minutes / 60),
  });
  return [
    upload("media-beach", "beach.jpg", "image", "image/jpeg", "/mock/red-apple.svg", 20),
    generated("media-apple", APPLE_PROMPT, "/mock/red-apple.svg", 25),
    upload("media-song", "song.mp3", "audio", "audio/mpeg", "/mock/chime.wav", 60),
    generated("media-cat", "A cat asleep on a windowsill", "/mock/red-apple.svg", 2 * 24 * 60),
  ];
}

export function createMockDb(): MockDb {
  return {
    chats: [chat("chat-apple", "Image of a Red Apple on a White Table", 5), chat("chat-greeting", "Greeting", 30)],
    messages: {
      "chat-apple": [
        message("m-apple-1", "chat-apple", "USER", "Generate an image of a red apple on a white table", [], minutesAgo(6)),
        message("m-apple-2", "chat-apple", "ASSISTANT", "Here's your image: a red apple on a white table.", appleBlocks, minutesAgo(5)),
      ],
      "chat-greeting": [
        message("m-greet-1", "chat-greeting", "USER", "Hello", [], minutesAgo(31)),
        message("m-greet-2", "chat-greeting", "ASSISTANT", "Hi! What can I help you with today?", [{ type: "text", content: "Hi! What can I help you with today?" }], minutesAgo(30)),
      ],
    },
    runs: {},
    sent: {},
    credits: { balance: 29_660_000, held: 0 },
    models: {
      models: [{ id: "openrouter/free", name: "OpenRouter Free", provider: "openrouter", free: true, isDefault: true }],
      defaultModelId: "openrouter/free",
      status: { health: "available", lastRoutedModel: "meta-llama/llama-3.3-70b-instruct:free", reason: null, checkedAt: new Date().toISOString() },
    },
    media: mediaFixtures(),
    uploads: {},
    waitpoints: {},
    plans: {},
    apiKeys: [mockApiKey()],
    nextId: 1,
  };
}

let db = createMockDb();
export const getMockDb = () => db;
// the browser mock keeps its data across a reload, so a run can be followed after one
export const setMockDb = (next: MockDb) => {
  db = next;
};
export const resetMockDb = () => {
  db = createMockDb();
};

// A task whose reply is only tool work (crop, merge, one failed step) and no text, to see how the real tools
// look in the browser mock. Not part of the default data.
export function addToolsChat(target: MockDb = db) {
  const id = "chat-tools";
  target.chats.unshift(chat(id, "Crop the apple and merge my clips", 3));
  target.messages[id] = [
    message("m-tools-1", id, "USER", "Crop the apple and merge my two clips", [], minutesAgo(4)),
    { ...message("m-tools-2", id, "ASSISTANT", "", toolsBlocks, minutesAgo(3)), agentRunId: "run-tools" },
  ];
}

// A task whose latest reply failed, for trying out Retry in the browser mock (and in tests that want one).
// Not part of the default data, so lists in tests stay small. The mock backend works `canRetry` out itself on
// every read; it is set here too so the fixture says what it is.
export function addRetryChat(target: MockDb = db) {
  const id = "chat-failed";
  target.chats.unshift(chat(id, "A reply that failed", 1));
  target.messages[id] = [
    message("m-failed-1", id, "USER", "Summarise today's news in two lines", [], minutesAgo(2)),
    {
      ...message("m-failed-2", id, "ASSISTANT", "", [], minutesAgo(1)),
      status: "FAILED",
      agentRunId: "run-failed",
      errorMessage: "The agent couldn't start in time. Please try again.",
      canRetry: true,
    },
  ];
  target.runs[id] = { id: "run-failed", chatId: id, triggerRunId: "trigger-run-failed", status: "FAILED", startedAt: minutesAgo(2), completedAt: minutesAgo(1) };
}

// A 240-message task, for trying out long histories and scrolling up in the browser mock. Not part of
// the default data, so lists in tests stay small.
export function addLongChat(target: MockDb = db) {
  const id = "chat-long";
  const messages: Message[] = [];
  for (let i = 0; i < 120; i++) {
    const at = minutesAgo(300 - i * 2);
    messages.push(message(`m-long-${i}-u`, id, "USER", `Question number ${i + 1}: ${"tell me more ".repeat(1 + (i % 5))}`, [], at));
    const reply = `Answer number ${i + 1}. ${"This is a longer line of the reply. ".repeat(1 + (i % 7))}`;
    messages.push(message(`m-long-${i}-a`, id, "ASSISTANT", reply, [{ type: "text", content: reply }], at));
  }
  target.chats.unshift(chat(id, "A very long conversation", 0));
  target.messages[id] = messages;
}

import type { AgentRun, Chat, ContentBlock, Credits, Message, ModelsResponse, SendMessageResponse } from "@/types";

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

const appleBlocks: ContentBlock[] = [
  { type: "tool_call", toolCallId: "tc-1", toolName: "skill", toolInput: { name: "image-generation" }, status: "completed", durationMs: 1700 },
  { type: "tool_call", toolCallId: "tc-2", toolName: "skill", toolInput: { name: "prompt-writing" }, status: "completed", durationMs: 2000 },
  { type: "tool_call", toolCallId: "tc-3", toolName: "model_schema", toolInput: { modelId: "gpt-image-2.5-flare-text" }, status: "completed", durationMs: 2900 },
  {
    type: "tool_call",
    toolCallId: "tc-4",
    toolName: "ai_generation",
    toolInput: { model: "gpt-image-2.5-flare-text", prompt: APPLE_PROMPT, size: "1024×1024", quality: "High" },
    status: "completed",
    durationMs: 34_700,
    creditCost: 70_000,
  },
  { type: "tool_result", toolCallId: "tc-4", toolName: "ai_generation", result: { url: "/mock/red-apple.svg" }, isError: false },
  { type: "text", content: "Here's your image: a red apple on a white table." },
  {
    type: "image",
    url: "/mock/red-apple.svg",
    altText: "A red apple on a white table",
    prompt: APPLE_PROMPT,
    model: "gpt-image-2.5-flare-text",
    width: 1024,
    height: 1024,
  },
  { type: "usage", inputTokens: 1200, outputTokens: 340, model: "gpt-image-2.5-flare-text", creditCost: 290_000 },
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
  nextId: number;
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
      status: { health: "available", lastRoutedModel: "meta-llama/llama-3.3-70b-instruct:free", checkedAt: new Date().toISOString() },
    },
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

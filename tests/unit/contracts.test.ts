import { describe, expect, it, vi } from "vitest";
import {
  ActiveRunResponseSchema,
  AgentStreamChunkSchema,
  AgentStreamMetadataSchema,
  ChatSchema,
  CitationBlockSchema,
  ContentBlockSchema,
  MessageSchema,
  RunStatusSchema,
  SendMessageResponseSchema,
} from "@/contracts";

const now = new Date().toISOString();

const message = (contentBlocks: unknown[]) => ({
  id: "m1",
  chatId: "c1",
  role: "ASSISTANT",
  content: "hi",
  contentBlocks,
  status: "COMPLETED",
  createdAt: now,
});

describe("ChatSchema", () => {
  const chat = { id: "c1", title: "Test", userId: "u1", createdAt: now, updatedAt: now, lastMessageAt: null };

  it("parses a valid chat", () => {
    expect(ChatSchema.safeParse(chat).success).toBe(true);
  });

  it("rejects a chat without an id", () => {
    expect(ChatSchema.safeParse({ ...chat, id: undefined }).success).toBe(false);
  });

  it("rejects a date that is not ISO 8601", () => {
    expect(ChatSchema.safeParse({ ...chat, createdAt: "yesterday" }).success).toBe(false);
  });

  it.each(["2026-09-30T14:42:00Z", "2026-09-30T14:42:00.123Z", "2026-09-30T14:42:00.123456Z", "2026-09-30T20:12:00+05:30"])(
    "accepts the ISO variant %s",
    (createdAt) => {
      expect(ChatSchema.safeParse({ ...chat, createdAt }).success).toBe(true);
    },
  );

  it("rejects a date without a timezone", () => {
    expect(ChatSchema.safeParse({ ...chat, createdAt: "2026-09-30T14:42:00" }).success).toBe(false);
  });

  it("ignores fields it does not know, so the backend can add some", () => {
    expect(ChatSchema.parse({ ...chat, somethingNew: 1 })).not.toHaveProperty("somethingNew");
  });
});

describe("ContentBlockSchema", () => {
  it("parses the block types we render", () => {
    const blocks = [
      { type: "text", content: "Hello" },
      { type: "thinking", content: "hmm", durationMs: 1200 },
      { type: "image", url: "/a.png", width: 1024, height: 1024 },
      { type: "video", url: "/a.mp4" },
      { type: "tool_call", toolCallId: "t1", toolName: "ai_generation", toolInput: { prompt: "a cat" }, status: "running" },
      { type: "usage", inputTokens: 1, outputTokens: 2, model: "m" },
    ];
    for (const block of blocks) expect(ContentBlockSchema.safeParse(block).success).toBe(true);
  });

  it("rejects an unknown block type", () => {
    expect(ContentBlockSchema.safeParse({ type: "unknown", content: "x" }).success).toBe(false);
  });

  it("defaults tool_result.isError to false", () => {
    const parsed = ContentBlockSchema.parse({ type: "tool_result", toolCallId: "t1", toolName: "x", result: 1 });
    expect(parsed).toMatchObject({ isError: false });
  });

  it("only allows http(s) citation links", () => {
    expect(CitationBlockSchema.safeParse({ type: "citation", url: "https://example.com" }).success).toBe(true);
    expect(CitationBlockSchema.safeParse({ type: "citation", url: "javascript:alert(1)" }).success).toBe(false);
  });
});

describe("MessageSchema", () => {
  it("drops a block it cannot read instead of failing the whole message", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const parsed = MessageSchema.parse(message([{ type: "text", content: "kept" }, { type: "hologram" }]));
    expect(parsed.contentBlocks).toEqual([{ type: "text", content: "kept" }]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("carries the client id when there is one, and works without it", () => {
    expect(MessageSchema.parse({ ...message([]), clientMessageId: "c-1" }).clientMessageId).toBe("c-1");
    expect(MessageSchema.parse({ ...message([]), clientMessageId: null }).clientMessageId).toBeNull();
    expect(MessageSchema.parse(message([])).clientMessageId).toBeUndefined();
  });

  it("still rejects a message with a wrong status", () => {
    expect(MessageSchema.safeParse({ ...message([]), status: "DONE" }).success).toBe(false);
  });
});

describe("SendMessageResponseSchema", () => {
  const response = {
    message: message([]),
    chatId: "c1",
    runId: "r1",
    triggerRunId: "run_abc",
    realtimeToken: "tok",
    realtimeTokenExpiresAt: now,
  };

  it("parses a valid response", () => {
    expect(SendMessageResponseSchema.safeParse(response).success).toBe(true);
  });

  it("needs the Trigger.dev run id for the realtime subscription", () => {
    expect(SendMessageResponseSchema.safeParse({ ...response, triggerRunId: undefined }).success).toBe(false);
  });
});

describe("RunStatusSchema", () => {
  it("maps Trigger.dev's CANCELED to CANCELLED", () => {
    expect(RunStatusSchema.parse("CANCELED")).toBe("CANCELLED");
    expect(RunStatusSchema.parse("CANCELLED")).toBe("CANCELLED");
  });

  it("rejects a status we don't know", () => {
    expect(RunStatusSchema.safeParse("EXECUTING").success).toBe(false);
  });
});

describe("ActiveRunResponseSchema", () => {
  it("parses the idle response", () => {
    const idle = { run: null, realtimeToken: null, realtimeTokenExpiresAt: null, partialText: null, partialBlocks: [] };
    expect(ActiveRunResponseSchema.safeParse(idle).success).toBe(true);
  });

  it("carries what has streamed so far and normalises the status", () => {
    const parsed = ActiveRunResponseSchema.parse({
      run: { id: "r1", chatId: "c1", triggerRunId: "t1", status: "CANCELED", startedAt: now, completedAt: null },
      realtimeToken: "tok",
      realtimeTokenExpiresAt: now,
      partialText: "Hel",
      partialBlocks: [{ type: "text", content: "Hel" }],
    });
    expect(parsed.run?.status).toBe("CANCELLED");
    expect(parsed.partialBlocks).toHaveLength(1);
  });
});

describe("AgentStreamMetadataSchema", () => {
  it("parses a thinking status", () => {
    expect(AgentStreamMetadataSchema.safeParse({ status: "thinking" }).success).toBe(true);
  });

  it("rejects an invalid status", () => {
    expect(AgentStreamMetadataSchema.safeParse({ status: "invalid" }).success).toBe(false);
  });
});

describe("AgentStreamChunkSchema", () => {
  it("parses every chunk type", () => {
    const chunks = [
      { type: "text-delta", delta: "Hi" },
      { type: "thinking-delta", delta: "hmm" },
      { type: "tool-start", toolCallId: "t1", toolName: "ai_generation", toolInput: {} },
      { type: "tool-end", toolCallId: "t1", status: "completed", durationMs: 10 },
      { type: "asset", asset: { type: "image", url: "/a.png" } },
      { type: "asset", asset: { type: "video", url: "/a.mp4" } },
    ];
    for (const chunk of chunks) expect(AgentStreamChunkSchema.safeParse(chunk).success).toBe(true);
  });

  it("rejects an unknown chunk and an asset that is not image or video", () => {
    expect(AgentStreamChunkSchema.safeParse({ type: "mystery" }).success).toBe(false);
    expect(AgentStreamChunkSchema.safeParse({ type: "asset", asset: { type: "text", content: "x" } }).success).toBe(false);
  });
});

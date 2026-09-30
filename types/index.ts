// Types are always inferred from the Zod contracts, never declared by hand.
import type { z } from "zod";
import type { ChatListResponseSchema, MessageListResponseSchema } from "@/contracts";

export type ChatListResponse = z.infer<typeof ChatListResponseSchema>;
export type MessageListResponse = z.infer<typeof MessageListResponseSchema>;

export type {
  ActiveRunResponse,
  AgentRun,
  AgentStreamChunk,
  AgentStreamMetadata,
  Chat,
  ContentBlock,
  Credits,
  ErrorCode,
  ErrorResponse,
  ImageBlock,
  Message,
  RunStatus,
  SendMessageResponse,
  ToolCallBlock,
  ToolResultBlock,
  UsageBlock,
  VideoBlock,
} from "@/contracts";

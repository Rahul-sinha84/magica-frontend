// Source of truth: magica-backend. Re-sync with `pnpm contracts:sync`, never edit by hand.
import { z } from "zod";
import { IsoDateTimeSchema } from "./common";

export const ChatSchema = z.object({
  id: z.string(),
  title: z.string(),
  userId: z.string(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  lastMessageAt: IsoDateTimeSchema.nullable(),
  _count: z.object({ messages: z.number() }).optional(),
});

export const CreateChatResponseSchema = z.object({ chat: ChatSchema });

export const ChatListResponseSchema = z.object({ chats: z.array(ChatSchema) });

export type Chat = z.infer<typeof ChatSchema>;

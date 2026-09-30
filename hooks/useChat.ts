"use client";

import { useQuery } from "@tanstack/react-query";
import { useApi } from "./useApi";

export const chatQueryKey = (chatId: string) => ["chat", chatId] as const;

// One task, asked for directly. The sidebar list only holds the first pages, so an older task
// would look "missing" if the page searched that list for it.
export function useChat(chatId: string) {
  const api = useApi();
  return useQuery({
    queryKey: chatQueryKey(chatId),
    queryFn: async ({ signal }) => (await api.chats.get(chatId, signal)).chat,
  });
}

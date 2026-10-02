"use client";

import { useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import type { Chat, ChatListResponse } from "@/types";
import { chatQueryKey } from "./useChat";
import { chatsQueryKey } from "./useChats";
import { EMPTY_MESSAGES, messagesQueryKey } from "./useMessages";
import { useApi } from "./useApi";

// Puts the new chat at the top of the list, after any pinned ones (the server's order).
function addToList(data: InfiniteData<ChatListResponse, string | null> | undefined, chat: Chat) {
  if (!data) return data;
  const [first, ...rest] = data.pages;
  const pinned = first.chats.filter((c) => c.isPinned).length;
  const chats = [...first.chats.slice(0, pinned), chat, ...first.chats.slice(pinned)];
  return { ...data, pages: [{ ...first, chats }, ...rest] };
}

// The first message of a new task creates the chat. Everything the chat page will ask for is put in
// the cache first, so it opens straight onto the conversation instead of a loading state, and the
// "doesn't exist" screen can't flash.
export function useCreateChat() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => (await api.chats.create()).chat,
    onSuccess: (chat) => {
      queryClient.setQueryData(chatQueryKey(chat.id), chat);
      queryClient.setQueryData(messagesQueryKey(chat.id), EMPTY_MESSAGES);
      queryClient.setQueryData<InfiniteData<ChatListResponse, string | null>>(chatsQueryKey, (data) => addToList(data, chat));
      queryClient.invalidateQueries({ queryKey: chatsQueryKey });
    },
  });
}

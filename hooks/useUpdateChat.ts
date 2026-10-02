"use client";

import { useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/queryClient";
import type { Chat, ChatListResponse } from "@/types";
import { chatQueryKey } from "./useChat";
import { chatsQueryKey } from "./useChats";
import { chatSearchKey } from "./useChatSearch";
import { useForgetChat } from "./useForgetChat";
import { useApi } from "./useApi";

type ChatPages = InfiniteData<ChatListResponse, string | null>;

export interface ChatUpdate {
  chatId: string;
  title?: string;
  isPinned?: boolean;
}

const patchPages = (data: ChatPages, chatId: string, patch: Partial<Chat>): ChatPages => ({
  ...data,
  pages: data.pages.map((page) => ({ ...page, chats: page.chats.map((chat) => (chat.id === chatId ? { ...chat, ...patch } : chat)) })),
});

function failureTitle({ title, isPinned }: Omit<ChatUpdate, "chatId">) {
  if (title !== undefined) return "Couldn't rename the task";
  return isPinned ? "Couldn't pin the task" : "Couldn't unpin the task";
}

// Rename or pin a chat. The change shows at once (in the sidebar, and on the chat's own page), the
// server's version replaces it when it answers, and a refusal puts things back with a toast saying why.
// A chat the server no longer has is taken off the screen, as a delete would.
export function useUpdateChat() {
  const api = useApi();
  const queryClient = useQueryClient();
  const forget = useForgetChat();

  return useMutation({
    mutationFn: ({ chatId, ...body }: ChatUpdate) => api.chats.update(chatId, body),
    onMutate: async ({ chatId, ...patch }) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: chatsQueryKey, exact: true }),
        queryClient.cancelQueries({ queryKey: chatQueryKey(chatId) }),
      ]);
      const list = queryClient.getQueryData<ChatPages>(chatsQueryKey);
      const chat = queryClient.getQueryData<Chat>(chatQueryKey(chatId));
      queryClient.setQueryData<ChatPages>(chatsQueryKey, (data) => data && patchPages(data, chatId, patch));
      queryClient.setQueryData<Chat>(chatQueryKey(chatId), (current) => current && { ...current, ...patch });
      return { list, chat };
    },
    onSuccess: ({ chat }) => {
      queryClient.setQueryData<ChatPages>(chatsQueryKey, (data) => data && patchPages(data, chat.id, chat));
      queryClient.setQueryData<Chat>(chatQueryKey(chat.id), chat);
    },
    onError: (error, { chatId, ...patch }, context) => {
      if (error instanceof ApiError && error.status === 404) return forget(chatId);
      if (context?.list) queryClient.setQueryData(chatsQueryKey, context.list);
      if (context?.chat) queryClient.setQueryData(chatQueryKey(chatId), context.chat);
      // the server's own words, e.g. why a title was refused
      toast.error(failureTitle(patch), { description: error.message });
    },
    // the server's order (pinned first, then most recent) and its search results have the last word
    onSettled: (_data, _error, { chatId }) => {
      queryClient.invalidateQueries({ queryKey: chatsQueryKey });
      queryClient.invalidateQueries({ queryKey: chatQueryKey(chatId) });
      queryClient.invalidateQueries({ queryKey: chatSearchKey });
    },
  });
}

"use client";

import { useCallback } from "react";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useChatStore } from "@/stores/chatStore";
import type { ChatListResponse } from "@/types";
import { chatQueryKey } from "./useChat";
import { chatsQueryKey } from "./useChats";

// Takes a chat off the screen everywhere: it was deleted here, or the server says it no longer exists.
export function useForgetChat() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const params = useParams<{ chatId?: string }>();

  return useCallback(
    (chatId: string) => {
      queryClient.setQueryData<InfiniteData<ChatListResponse, string | null>>(chatsQueryKey, (data) =>
        data && { ...data, pages: data.pages.map((page) => ({ ...page, chats: page.chats.filter((c) => c.id !== chatId) })) },
      );
      queryClient.removeQueries({ queryKey: chatQueryKey(chatId) });
      queryClient.removeQueries({ queryKey: ["messages", chatId] });
      // a run it had in flight is over with it (the backend cancels it), so nothing waits for it
      useChatStore.getState().clearRun(chatId);
      useChatStore.getState().setDraft(chatId, "");
      if (params.chatId === chatId) router.replace("/chat");
    },
    [queryClient, router, params.chatId],
  );
}

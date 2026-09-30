"use client";

import { useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ApiError } from "@/lib/queryClient";
import { useChatStore } from "@/stores/chatStore";
import type { ChatListResponse } from "@/types";
import { chatQueryKey } from "./useChat";
import { chatsQueryKey } from "./useChats";
import { useApi } from "./useApi";

export function useDeleteChat() {
  const api = useApi();
  const queryClient = useQueryClient();
  const router = useRouter();
  const params = useParams<{ chatId?: string }>();

  // the chat is gone from the screen whether we deleted it or it was already gone
  function forget(chatId: string) {
    queryClient.setQueryData<InfiniteData<ChatListResponse, string | null>>(chatsQueryKey, (data) =>
      data && { ...data, pages: data.pages.map((page) => ({ ...page, chats: page.chats.filter((c) => c.id !== chatId) })) },
    );
    queryClient.removeQueries({ queryKey: chatQueryKey(chatId) });
    queryClient.removeQueries({ queryKey: ["messages", chatId] });
    // a run it had in flight is over with it (the backend cancels it), so nothing waits for it
    useChatStore.getState().clearRun(chatId);
    useChatStore.getState().setDraft(chatId, "");
    if (params.chatId === chatId) router.replace("/chat");
  }

  return useMutation({
    mutationFn: (chatId: string) => api.chats.delete(chatId),
    onSuccess: (_data, chatId) => forget(chatId),
    onError: (error, chatId) => {
      if (error instanceof ApiError && error.status === 404) return forget(chatId);
      toast.error("Couldn't delete the task", { description: error.message });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: chatsQueryKey }),
  });
}

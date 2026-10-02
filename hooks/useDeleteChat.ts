"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/queryClient";
import { chatsQueryKey } from "./useChats";
import { chatSearchKey } from "./useChatSearch";
import { useForgetChat } from "./useForgetChat";
import { useApi } from "./useApi";

export function useDeleteChat() {
  const api = useApi();
  const queryClient = useQueryClient();
  // the chat is gone from the screen whether we deleted it or it was already gone
  const forget = useForgetChat();

  return useMutation({
    mutationFn: (chatId: string) => api.chats.delete(chatId),
    onSuccess: (_data, chatId) => forget(chatId),
    onError: (error, chatId) => {
      if (error instanceof ApiError && error.status === 404) return forget(chatId);
      toast.error("Couldn't delete the task", { description: error.message });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: chatsQueryKey });
      queryClient.invalidateQueries({ queryKey: chatSearchKey });
    },
  });
}

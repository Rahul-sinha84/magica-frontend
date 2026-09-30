"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ApiError } from "@/lib/queryClient";
import type { Chat } from "@/types";
import { chatsQueryKey } from "./useChats";
import { useApi } from "./useApi";

export function useDeleteChat() {
  const api = useApi();
  const queryClient = useQueryClient();
  const router = useRouter();
  const params = useParams<{ chatId?: string }>();

  // the chat is gone from the screen whether we deleted it or it was already gone
  function forget(chatId: string) {
    queryClient.setQueryData<Chat[]>(chatsQueryKey, (chats) => chats?.filter((c) => c.id !== chatId));
    queryClient.removeQueries({ queryKey: ["messages", chatId] });
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

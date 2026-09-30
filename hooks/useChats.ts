"use client";

import { useQuery } from "@tanstack/react-query";
import { useApi } from "./useApi";

export const chatsQueryKey = ["chats"] as const;

export function useChats() {
  const api = useApi();
  return useQuery({
    queryKey: chatsQueryKey,
    queryFn: async ({ signal }) => (await api.chats.list(signal)).chats,
    refetchInterval: 30_000,
  });
}

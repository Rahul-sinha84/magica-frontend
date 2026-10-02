"use client";

import { useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { Chat } from "@/types";
import { useApi } from "./useApi";

export const chatsQueryKey = ["chats"] as const;

// A chat can move from one page to the next while you are scrolling (a newer one arrives), so the
// same id may come back twice. Keep the first.
function uniqueById(chats: Chat[]) {
  return [...new Map(chats.map((chat) => [chat.id, chat])).values()];
}

// The recent-tasks list. The server decides the order (pinned first, then most recent) and pages it.
export function useChats() {
  const api = useApi();
  const query = useInfiniteQuery({
    queryKey: chatsQueryKey,
    queryFn: ({ pageParam, signal }) => api.chats.list(pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.cursor,
    refetchInterval: 30_000,
  });
  const chats = useMemo(
    () => query.data && uniqueById(query.data.pages.flatMap((page) => page.chats)),
    [query.data],
  );
  return { ...query, chats };
}

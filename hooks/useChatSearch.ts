"use client";

import { useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { SEARCH_QUERY_MIN } from "@/contracts";
import type { Chat } from "@/types";
import { useApi } from "./useApi";
import { useDebounced } from "./useDebounced";

// every search, under one root so a rename, pin or delete can refresh them all
export const chatSearchKey = ["chat-search"] as const;
export const SEARCH_DEBOUNCE_MS = 250;

// The search palette's results: chats whose title or messages contain the text, newest activity first, a
// page at a time. It asks only once typing pauses, and only for SEARCH_QUERY_MIN characters or more (the
// server refuses less). Each query has its own cache entry, so an answer to an earlier query never shows
// for a later one, and a query nobody waits for any more is cancelled.
export function useChatSearch(text: string) {
  const api = useApi();
  const q = useDebounced(text.trim(), SEARCH_DEBOUNCE_MS);
  const active = q.length >= SEARCH_QUERY_MIN;
  const query = useInfiniteQuery({
    queryKey: [...chatSearchKey, q],
    queryFn: ({ pageParam, signal }) => api.chats.search(q, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.cursor,
    enabled: active,
    staleTime: 30_000,
  });
  // one entry per chat, even if a chat moved between pages while scrolling
  const chats = useMemo<Chat[] | undefined>(
    () => query.data && [...new Map(query.data.pages.flatMap((page) => page.chats).map((chat) => [chat.id, chat])).values()],
    [query.data],
  );
  return { ...query, q, active, chats };
}

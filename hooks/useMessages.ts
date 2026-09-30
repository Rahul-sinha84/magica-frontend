"use client";

import { useMemo } from "react";
import { useInfiniteQuery, type InfiniteData } from "@tanstack/react-query";
import type { Message, MessageListResponse } from "@/types";
import { useApi } from "./useApi";

export const messagesQueryKey = (chatId: string) => ["messages", chatId] as const;

export type MessagesData = InfiniteData<MessageListResponse, string | null>;

// A conversation with nothing in it yet, used to seed the cache for a chat we just created.
export const EMPTY_MESSAGES: MessagesData = { pages: [{ messages: [], cursor: null }], pageParams: [null] };

// Pages arrive newest first and each page is oldest to newest, so the list is the pages reversed.
// A message can land on two pages if one is sent while you page back, so keep the first of each id.
function conversation(data: MessagesData): Message[] {
  const all = [...data.pages].reverse().flatMap((page) => page.messages);
  return [...new Map(all.map((message) => [message.id, message])).values()];
}

const NO_MESSAGES: Message[] = [];

export function useMessages(chatId: string) {
  const api = useApi();
  const query = useInfiniteQuery<MessageListResponse, Error, MessagesData, ReturnType<typeof messagesQueryKey>, string | null>({
    queryKey: messagesQueryKey(chatId),
    queryFn: ({ pageParam, signal }) => api.messages.list(chatId, pageParam, signal),
    initialPageParam: null as string | null,
    // the cursor points at the next OLDER page
    getNextPageParam: (lastPage) => lastPage.cursor,
  });
  const messages = useMemo(() => (query.data ? conversation(query.data) : NO_MESSAGES), [query.data]);
  return { ...query, messages };
}

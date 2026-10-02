"use client";

import { useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { SEARCH_QUERY_MIN } from "@/contracts";
import type { MediaAsset } from "@/types";
import { useApi } from "./useApi";
import { SEARCH_DEBOUNCE_MS } from "./useChatSearch";
import { useDebounced } from "./useDebounced";

// every media list, under one root, so a finished upload can refresh them all
export const mediaQueryKey = ["media"] as const;
export type MediaTab = "all" | "generated" | "upload";

// The media library, newest first, a page at a time: one tab's files (all, generated, or uploaded), searched by
// file name and prompt once there are SEARCH_QUERY_MIN characters (fewer shows the whole list, as in the ⌘K
// palette). Each tab and search has its own cache entry, so an answer to an earlier one never shows for a later.
export function useMediaLibrary(tab: MediaTab, text: string) {
  const api = useApi();
  const typed = useDebounced(text.trim(), SEARCH_DEBOUNCE_MS);
  const q = typed.length >= SEARCH_QUERY_MIN ? typed : "";
  const query = useInfiniteQuery({
    queryKey: [...mediaQueryKey, tab, q],
    queryFn: ({ pageParam, signal }) =>
      api.media.list({ source: tab === "all" ? undefined : tab, q: q || undefined, cursor: pageParam }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.cursor,
  });
  const media = useMemo<MediaAsset[] | undefined>(
    () => query.data && [...new Map(query.data.pages.flatMap((page) => page.media).map((asset) => [asset.id, asset])).values()],
    [query.data],
  );
  return { ...query, q, media, total: query.data?.pages[0]?.total };
}

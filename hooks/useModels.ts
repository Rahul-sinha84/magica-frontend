"use client";

import { useQuery } from "@tanstack/react-query";
import { useApi } from "./useApi";

export const modelsQueryKey = ["models"] as const;

// The free model and its recent health, kept fresh: every minute, and when the window regains focus.
export function useModels() {
  const api = useApi();
  return useQuery({
    queryKey: modelsQueryKey,
    queryFn: ({ signal }) => api.models.get(signal),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

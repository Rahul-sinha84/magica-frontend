"use client";

import { useQuery } from "@tanstack/react-query";
import { useApi } from "./useApi";

export const creditsQueryKey = ["credits"] as const;

export function useCredits() {
  const api = useApi();
  return useQuery({
    queryKey: creditsQueryKey,
    queryFn: ({ signal }) => api.credits.get(signal),
    refetchInterval: 60_000,
  });
}

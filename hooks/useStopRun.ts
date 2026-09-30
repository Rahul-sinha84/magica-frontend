"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/queryClient";
import { useChatStore } from "@/stores/chatStore";
import { activeRunQueryKey } from "./useRunWatcher";
import { useApi } from "./useApi";

// The Stop button. Whatever the server answers, the run is checked again afterwards: if Stop was
// pressed just as the run finished, the server may refuse with a 4xx, and that is not a failure,
// it only means the run is already over.
export function useStopRun(chatId: string) {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const run = useChatStore.getState().runs[chatId];
      if (!run) return;
      try {
        await api.runs.cancel(run.runId);
      } catch (error) {
        const refused = error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 401;
        if (!refused) throw error;
      }
    },
    onError: (error) => toast.error("Couldn't stop the response", { description: error.message }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: activeRunQueryKey(chatId) }),
  });
}

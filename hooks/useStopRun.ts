"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cancelRun } from "@/lib/cancelRun";
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
      const store = useChatStore.getState();
      const run = store.runs[chatId];
      if (run) {
        // show "stopping" at once, until the server confirms the run has ended
        store.setStopping(chatId);
        try {
          return await cancelRun(api, run.runId);
        } catch (error) {
          useChatStore.getState().clearStopping(chatId); // it didn't go through: Stop can be pressed again
          throw error;
        }
      }
      // the message is still on its way, so there is no run to cancel yet: cancel it as soon as there is
      if ((store.optimistic[chatId] ?? []).length > 0) store.requestStop(chatId);
    },
    onError: (error) => toast.error("Couldn't stop the response", { description: error.message }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: activeRunQueryKey(chatId) }),
  });
}

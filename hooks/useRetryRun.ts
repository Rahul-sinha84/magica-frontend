"use client";

import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/queryClient";
import { useChatStore } from "@/stores/chatStore";
import { chatQueryKey } from "./useChat";
import { chatsQueryKey } from "./useChats";
import { creditsQueryKey } from "./useCredits";
import { messagesQueryKey } from "./useMessages";
import { activeRunQueryKey } from "./useRunWatcher";
import { explain } from "./useSendMessage";
import { useApi } from "./useApi";

// Retry on a failed or stopped reply: the same question, answered again as a new turn. The new reply is
// followed exactly like one after a send; the failed one stays where it is, above it. Which reply can be
// retried is the backend's call (`canRetry`), never worked out here.
export function useRetryRun(chatId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  // set synchronously, because isPending only flips on the next render and a fast double click beats it
  const inFlight = useRef(false);

  const refetchMessages = () => queryClient.refetchQueries({ queryKey: messagesQueryKey(chatId), exact: true });

  const mutation = useMutation({
    mutationFn: (runId: string) => api.runs.retry(runId),
    // 201 (a new retry) and 200 (it had already started, e.g. a double click) are the same to us
    onSuccess: (response) => {
      const store = useChatStore.getState();
      store.clearStopRequest(chatId);
      store.setRun(chatId, {
        runId: response.runId,
        triggerRunId: response.triggerRunId,
        realtimeToken: response.realtimeToken,
        realtimeTokenExpiresAt: response.realtimeTokenExpiresAt,
        startedAt: Date.now(),
        // waits in the queue until Trigger.dev starts it, like a new send
        status: "PENDING",
        statusAt: Date.now(),
      });
      for (const queryKey of [messagesQueryKey(chatId), creditsQueryKey, chatQueryKey(chatId), chatsQueryKey]) {
        queryClient.invalidateQueries({ queryKey });
      }
    },
    onError: (error) => {
      if (!(error instanceof ApiError)) {
        toast.error("Couldn't retry", { description: error.message });
        return;
      }
      if (error.status === 401) return; // the app-wide "session expired" notice takes it from here
      if (error.code === "RUN_NOT_RETRYABLE") {
        toast.error("This reply can't be retried any more.");
        void refetchMessages();
      } else if (error.code === "RUN_ACTIVE") {
        toast.error("A response is already being generated.");
        queryClient.invalidateQueries({ queryKey: activeRunQueryKey(chatId) });
      } else if (error.status === 404) {
        toast.error("Couldn't retry", { description: "This reply or task no longer exists." });
        void refetchMessages();
        queryClient.invalidateQueries({ queryKey: chatQueryKey(chatId) });
      } else {
        // credits, rate limit, unavailable, or no clear answer at all (the retry may have started anyway,
        // so look for a run)
        toast.error("Couldn't retry", { description: explain(error) });
        queryClient.invalidateQueries({ queryKey: activeRunQueryKey(chatId) });
      }
    },
    onSettled: () => {
      inFlight.current = false;
    },
  });

  function retry(runId: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    mutation.mutate(runId);
  }

  return { retry, isRetrying: mutation.isPending };
}

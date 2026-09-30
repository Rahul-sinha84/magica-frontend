"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cancelRun } from "@/lib/cancelRun";
import { ApiError } from "@/lib/queryClient";
import { RUN_POLL_MS } from "@/lib/timing";
import { useChatStore } from "@/stores/chatStore";
import { chatQueryKey } from "./useChat";
import { chatsQueryKey } from "./useChats";
import { creditsQueryKey } from "./useCredits";
import { messagesQueryKey } from "./useMessages";
import { useApi } from "./useApi";

export const activeRunQueryKey = (chatId: string) => ["active-run", chatId] as const;

// Keeps the screen in step with the run the server has in flight for this chat. The server owns that
// fact: opening the page asks for it (so a reload mid-run still shows it), and while a run is going
// it is checked every couple of seconds. When the server says it is over, the reply, the credits and
// the task's name are fetched. Phase 5 adds live streaming on top and keeps this as the fallback.
export function useRunWatcher(chatId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  const run = useChatStore((s) => s.runs[chatId]);
  const setRun = useChatStore((s) => s.setRun);
  const clearRun = useChatStore((s) => s.clearRun);

  const { data, dataUpdatedAt, error } = useQuery({
    queryKey: activeRunQueryKey(chatId),
    queryFn: ({ signal }) => api.runs.getActive(chatId, signal),
    refetchInterval: run ? RUN_POLL_MS : false,
    refetchOnMount: "always",
    staleTime: 0,
  });

  // the task is gone (deleted elsewhere): there is no run to wait for, so don't sit on "Thinking" forever
  const gone = error instanceof ApiError && error.status === 404;
  useEffect(() => {
    if (gone && run) clearRun(chatId);
  }, [gone, run, chatId, clearRun]);

  useEffect(() => {
    // `data` is the last good answer, which may still describe a run; a task that is gone has none
    if (!data || gone) return;
    if (data.run && !run) {
      // a run we didn't start in this tab (a reload, or another device)
      setRun(chatId, {
        runId: data.run.id,
        triggerRunId: data.run.triggerRunId,
        realtimeToken: data.realtimeToken,
        realtimeTokenExpiresAt: data.realtimeTokenExpiresAt,
        startedAt: dataUpdatedAt,
      });
      // Stop was pressed while we didn't yet know the run (a send that timed out, then turned up here)
      const store = useChatStore.getState();
      if (store.stopRequested[chatId]) {
        store.clearStopRequest(chatId);
        cancelRun(api, data.run.id).catch((error: Error) => toast.error("Couldn't stop the response", { description: error.message }));
      }
    } else if (!data.run && run && dataUpdatedAt > run.startedAt) {
      // only an answer newer than the run counts; an older "no run" predates it
      clearRun(chatId);
      for (const queryKey of [messagesQueryKey(chatId), chatQueryKey(chatId), chatsQueryKey, creditsQueryKey]) {
        queryClient.invalidateQueries({ queryKey });
      }
    }
  }, [data, gone, dataUpdatedAt, run, chatId, setRun, clearRun, queryClient, api]);

  return { run };
}

"use client";

import { useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cancelRun } from "@/lib/cancelRun";
import { ApiError } from "@/lib/queryClient";
import { LIVE_POLL_MS, RUN_POLL_MS, TOKEN_REFRESH_LEAD_MS } from "@/lib/timing";
import { useChatStore } from "@/stores/chatStore";
import { chatQueryKey } from "./useChat";
import { chatsQueryKey } from "./useChats";
import { creditsQueryKey } from "./useCredits";
import { messagesQueryKey } from "./useMessages";
import { useApi } from "./useApi";

export const activeRunQueryKey = (chatId: string) => ["active-run", chatId] as const;

// A token worth replacing: none yet, or about to run out. The server hands out a new one on every
// check, and swapping it each time would restart the live stream every few seconds.
function needsToken(expiresAt: string | null, now: number) {
  return !expiresAt || Date.parse(expiresAt) - now < TOKEN_REFRESH_LEAD_MS;
}

// Keeps the screen in step with the run the server has in flight for this chat. The server owns that
// fact: opening the page asks for it (so a reload mid-run still shows it), and while a run is going it
// is checked again: every couple of seconds when there is no live stream, rarely when there is. Only
// the server can say a run is over. When it does, the reply is loaded BEFORE the run is let go, so the
// streaming row is replaced by the saved message with nothing in between.
export function useRunWatcher(chatId: string, { live = false }: { live?: boolean } = {}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const run = useChatStore((s) => s.runs[chatId]);
  const setRun = useChatStore((s) => s.setRun);
  const patchRun = useChatStore((s) => s.patchRun);
  const clearRun = useChatStore((s) => s.clearRun);

  const { data, dataUpdatedAt, error, refetch } = useQuery({
    queryKey: activeRunQueryKey(chatId),
    queryFn: ({ signal }) => api.runs.getActive(chatId, signal),
    refetchInterval: run ? (live ? LIVE_POLL_MS : RUN_POLL_MS) : false,
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
        cancelRun(api, data.run.id)
          .then(() => store.setStopping(chatId))
          .catch((error: Error) => toast.error("Couldn't stop the response", { description: error.message }));
      }
    } else if (data.run && run && data.run.id === run.runId) {
      if (data.realtimeToken && data.realtimeTokenExpiresAt && needsToken(run.realtimeTokenExpiresAt, Date.now())) {
        patchRun(chatId, { realtimeToken: data.realtimeToken, realtimeTokenExpiresAt: data.realtimeTokenExpiresAt });
      }
      // a run restored before Trigger.dev picked it up had no Trigger.dev id yet; with one, it can stream live
      if (!run.triggerRunId && data.run.triggerRunId) patchRun(chatId, { triggerRunId: data.run.triggerRunId });
    }
  }, [data, gone, dataUpdatedAt, run, chatId, setRun, patchRun, api]);

  // The server says the run is over. Only an answer newer than the run counts; an older "no run" predates
  // it. This is keyed on the run alone, so the checks that keep coming meanwhile don't restart it.
  const ended = data && !data.run && !gone && run && dataUpdatedAt > run.startedAt ? run.runId : null;
  useEffect(() => {
    if (!ended) return;
    // Load the reply first, then let the run go, so the saved message takes the streaming row's place in
    // one step. If the reply can't be loaded (the connection dropped just then), keep showing what was
    // streamed and try again, rather than let the reply vanish until something else reloads the list.
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const finish = async () => {
      await queryClient.refetchQueries({ queryKey: messagesQueryKey(chatId), exact: true });
      if (cancelled) return;
      if (queryClient.getQueryState(messagesQueryKey(chatId))?.status === "error") {
        retry = setTimeout(finish, RUN_POLL_MS);
        return;
      }
      // a new run may have started in the meantime; only end the one this answer was about
      if (useChatStore.getState().runs[chatId]?.runId === ended) clearRun(chatId);
      for (const queryKey of [chatQueryKey(chatId), chatsQueryKey, creditsQueryKey]) {
        queryClient.invalidateQueries({ queryKey });
      }
    };
    void finish();
    return () => {
      cancelled = true;
      clearTimeout(retry);
    };
  }, [ended, chatId, clearRun, queryClient]);

  // ask the server now (the live stream says the run ended, or the token is about to run out)
  const check = useCallback(() => void refetch(), [refetch]);

  const partial = data?.run && run && data.run.id === run.runId ? data : null;
  // the last check failed (not a 404): the server can't be reached right now, and the checks go on
  const reconnecting = !!run && !!error && !gone;
  return { run, partial, check, reconnecting };
}

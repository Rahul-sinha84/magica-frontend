"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { RespondWaitpointBody } from "@/contracts";
import { ApiError } from "@/lib/queryClient";
import { useChatStore } from "@/stores/chatStore";
import { activeRunQueryKey } from "./useRunWatcher";
import { useApi } from "./useApi";

export const RESPOND_UNAVAILABLE = "We couldn't send your answer right now. Try again in a moment.";

// The user's answer to what a run waits on (a plan, or a spend). One answer at a time, so a double click, or Enter
// and a click together, sends once. The server's answer decides what happens to the card: a closed waitpoint
// (answered here or elsewhere, expired, stopped) takes it away; a refusal is shown on it, and it can be answered again.
export function useRespondWaitpoint(chatId: string, waitpointId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  const closeWaitpoint = useChatStore((s) => s.closeWaitpoint);
  // set at once, because isPending only flips on the next render and a fast double click beats it
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (body: RespondWaitpointBody) => api.waitpoints.respond(waitpointId, body),
    onSuccess: ({ waitpoint }) => {
      if (waitpoint.status !== "pending") closeWaitpoint(waitpoint.id);
    },
    onError: (failure) => {
      if (failure instanceof ApiError && failure.status === 401) return; // the app-wide "session expired" notice
      if (failure instanceof ApiError && failure.status === 404) {
        // not this user's, or gone: nothing is left to answer; the server says what the run is doing now
        closeWaitpoint(waitpointId);
        void queryClient.invalidateQueries({ queryKey: activeRunQueryKey(chatId) });
        toast.error("Couldn't send your answer", { description: failure.message });
        return;
      }
      // nothing was saved: say why, and leave the card to be answered again
      if (failure instanceof ApiError && failure.status === 503) setError(RESPOND_UNAVAILABLE);
      // the backend names the field a refusal is about ("feedback: Say what you'd like changed."); the card doesn't need it
      else setError(failure instanceof ApiError ? failure.message.replace(/^(?:action|feedback): /, "") : "Couldn't send your answer. Try again.");
    },
    onSettled: () => {
      inFlight.current = false;
    },
  });

  function respond(body: RespondWaitpointBody) {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    mutation.mutate(body);
  }

  return { respond, sending: mutation.isPending, error };
}

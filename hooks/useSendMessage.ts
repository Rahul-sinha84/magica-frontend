"use client";

import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { NO_NUL_MESSAGE, noNul } from "@/contracts";
import { cancelRun } from "@/lib/cancelRun";
import { ApiError } from "@/lib/queryClient";
import { uuid } from "@/lib/uuid";
import type { Message, SendMessageResponse } from "@/types";
import { NEW_CHAT, useChatStore } from "@/stores/chatStore";
import { chatsQueryKey } from "./useChats";
import { creditsQueryKey } from "./useCredits";
import { useCreateChat } from "./useCreateChat";
import { messagesQueryKey, type MessagesData } from "./useMessages";
import { activeRunQueryKey } from "./useRunWatcher";
import { useApi } from "./useApi";

// The request may have reached the server even though we didn't get a clean answer: a timeout or lost
// connection (0), a bad gateway or timeout from a proxy (502, 504), or an answer we couldn't read (422).
const isAmbiguous = (error: unknown) =>
  error instanceof ApiError && [0, 502, 504, 422].includes(error.status);

function explain(error: ApiError) {
  switch (error.code) {
    case "INSUFFICIENT_CREDITS":
      return "You don't have enough credits for this.";
    case "RATE_LIMITED":
      return "You're sending messages too fast. Wait a moment and try again.";
    case "PAYLOAD_TOO_LARGE":
      return "That message is too large to send.";
    case "SERVICE_UNAVAILABLE":
      return "The assistant is unavailable right now. Try again shortly.";
    default:
      return error.message;
  }
}

// Adds the server's copy of a message to the newest page, so it shows without waiting for a refetch.
function appendMessage(data: MessagesData | undefined, message: Message) {
  if (!data || data.pages.some((page) => page.messages.some((m) => m.id === message.id))) return data;
  const [newest, ...older] = data.pages;
  return { ...data, pages: [{ ...newest, messages: [...newest.messages, message] }, ...older] };
}

export function useSendMessage(chatId: string | null) {
  const api = useApi();
  const queryClient = useQueryClient();
  const router = useRouter();
  const createChat = useCreateChat();
  // set synchronously, because isPending only flips on the next render and a fast double click beats it
  const inFlight = useRef(false);
  const key = chatId ?? NEW_CHAT;

  async function sendTo(targetId: string, content: string, clientMessageId: string, key: string) {
    const store = useChatStore.getState();

    // Did the message reach the server after all? Ask it, rather than tell the user it failed.
    const reachedServer = async () => {
      await queryClient.refetchQueries({ queryKey: messagesQueryKey(targetId), exact: true });
      const data = queryClient.getQueryData<MessagesData>(messagesQueryKey(targetId));
      return !!data?.pages.some((page) => page.messages.some((m) => m.clientMessageId === clientMessageId));
    };

    const accepted = async (response: SendMessageResponse | null) => {
      store.forgetFailedSend(key);
      if (response) {
        queryClient.setQueryData<MessagesData>(messagesQueryKey(targetId), (data) => appendMessage(data, response.message));
        store.setRun(targetId, {
          runId: response.runId,
          triggerRunId: response.triggerRunId,
          realtimeToken: response.realtimeToken,
          realtimeTokenExpiresAt: response.realtimeTokenExpiresAt,
          startedAt: Date.now(),
          // a new turn waits in the queue until Trigger.dev starts it; the run watcher hears when it does
          status: "PENDING",
          statusAt: Date.now(),
        });
        // Stop was pressed while this was on its way
        if (useChatStore.getState().stopRequested[targetId]) {
          useChatStore.getState().clearStopRequest(targetId);
          await cancelRun(api, response.runId)
            .then(() => useChatStore.getState().setStopping(targetId))
            .catch((error: Error) => toast.error("Couldn't stop the response", { description: error.message }));
        }
      }
      // the server's copy is in the list now (seeded above, or found by the refetch), so the pending one can go
      store.removeOptimistic(targetId, clientMessageId);
      // with no response to read the run from, the run watcher finds it
      for (const queryKey of [activeRunQueryKey(targetId), messagesQueryKey(targetId), chatsQueryKey, creditsQueryKey]) {
        queryClient.invalidateQueries({ queryKey });
      }
    };

    try {
      await accepted(await api.messages.send(targetId, { content, clientMessageId }));
    } catch (error) {
      if (isAmbiguous(error) && (await reachedServer())) return accepted(null);

      // it did not go: take the message back off the screen and give the text back
      const latest = useChatStore.getState();
      latest.removeOptimistic(targetId, clientMessageId);
      latest.clearStopRequest(targetId);
      const typedSince = latest.drafts[key] ?? "";
      latest.setDraft(key, typedSince ? `${content}\n${typedSince}` : content);
      latest.rememberFailedSend(key, { content, clientMessageId });

      if (!(error instanceof ApiError)) throw error;
      if (error.status === 409 && error.code === "RUN_ACTIVE") {
        // a run is already going (this tab didn't know): show it, and keep the text for later
        queryClient.invalidateQueries({ queryKey: activeRunQueryKey(targetId) });
        toast.error("A response is already being generated", { description: "Your message is back in the box. Send it when it finishes." });
      } else if (error.status === 401) {
        throw error; // the app-wide "session expired" notice takes it from here
      } else {
        toast.error("Message not sent", { description: explain(error) });
      }
    }
  }

  const mutation = useMutation({
    mutationFn: async (content: string) => {
      const store = useChatStore.getState();
      // the same text sent again after a failure keeps its id, so a first attempt that did arrive isn't doubled
      const failed = store.failedSends[key];
      const clientMessageId = failed?.content === content ? failed.clientMessageId : uuid();
      store.setDraft(key, "");

      let targetId = chatId;
      if (!targetId) {
        try {
          targetId = (await createChat.mutateAsync()).id;
        } catch (error) {
          store.setDraft(key, content);
          if (!(error instanceof ApiError)) throw error;
          if (error.status === 401) throw error;
          toast.error("Couldn't start the task", { description: explain(error) });
          return;
        }
      }

      // a Stop left over from an earlier send whose run never showed up must not cancel this one
      store.clearStopRequest(targetId);
      store.addOptimistic({ clientMessageId, chatId: targetId, content, createdAt: new Date().toISOString() });
      if (!chatId) router.push(`/chat/${encodeURIComponent(targetId)}`);
      // Once the task exists, a failure belongs to ITS composer: we are on its page by now, not on home.
      await sendTo(targetId, content, clientMessageId, chatId ? key : targetId);
    },
    onSettled: () => {
      inFlight.current = false;
    },
  });

  function send(content: string) {
    if (inFlight.current) return;
    if (!noNul(content)) {
      toast.error("Message not sent", { description: NO_NUL_MESSAGE });
      return;
    }
    inFlight.current = true;
    mutation.mutate(content);
  }

  return { send, isSending: mutation.isPending };
}

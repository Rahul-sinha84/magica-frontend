"use client";

import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { NO_NUL_MESSAGE, noNul, type RunMode } from "@/contracts";
import { cancelRun } from "@/lib/cancelRun";
import { ApiError } from "@/lib/queryClient";
import { uuid } from "@/lib/uuid";
import type { Message, SendMessageResponse } from "@/types";
import { useAttachmentsStore, type Attachment } from "@/stores/attachmentsStore";
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

// The backend names the field a refusal is about ("attachments.0: …", "files.2.size: …"). The screen already
// shows which file it is, so a toast gives just the reason.
export const withoutField = (message: string) => message.replace(/^(?:attachments\.\d+|files\.\d+\.[\w.]+): /, "");

// What to tell the user when the server turns a message (or a retry) down.
export function explain(error: ApiError) {
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
      return withoutField(error.message);
  }
}

const sameFiles = (a: string[] = [], b: string[] = []) => a.length === b.length && a.every((id, i) => id === b[i]);
const fileIds = (files: Attachment[]) => files.flatMap((file) => (file.asset ? [file.asset.id] : []));

// The chips of a send that didn't go, back in front of anything attached since. A file the server refused
// ("attachments.2: This file has expired. Upload it again.") is marked, so it can be removed.
function giveBackFiles(key: string, files: Attachment[], error?: ApiError) {
  if (files.length === 0) return;
  const chips = useAttachmentsStore.getState();
  const refused = error && /^attachments\.(\d+): (.*)$/.exec(error.message);
  const marked = files.map((file, index) =>
    refused && Number(refused[1]) === index
      ? { ...file, status: /expired/i.test(refused[2]) ? ("expired" as const) : ("failed" as const), error: refused[2] }
      : file,
  );
  chips.set(key, [...marked, ...(chips.byComposer[key] ?? [])]);
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

  async function sendTo(targetId: string, content: string, clientMessageId: string, key: string, files: Attachment[], mode: RunMode) {
    const store = useChatStore.getState();

    // Did the message reach the server after all? Ask it, rather than tell the user it failed.
    const reachedServer = async () => {
      await queryClient.refetchQueries({ queryKey: messagesQueryKey(targetId), exact: true });
      const data = queryClient.getQueryData<MessagesData>(messagesQueryKey(targetId));
      return !!data?.pages.some((page) => page.messages.some((m) => m.clientMessageId === clientMessageId));
    };

    const accepted = async (response: SendMessageResponse | null) => {
      store.forgetFailedSend(key);
      // the files went with the message; their local previews aren't needed any more
      for (const file of files) if (file.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(file.previewUrl);
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
      const attachments = fileIds(files).map((mediaAssetId) => ({ mediaAssetId }));
      await accepted(await api.messages.send(targetId, { content, clientMessageId, attachments, mode }));
    } catch (error) {
      if (isAmbiguous(error) && (await reachedServer())) return accepted(null);

      // it did not go: take the message back off the screen and give the text and files back
      const latest = useChatStore.getState();
      latest.removeOptimistic(targetId, clientMessageId);
      latest.clearStopRequest(targetId);
      const typedSince = latest.drafts[key] ?? "";
      latest.setDraft(key, typedSince ? `${content}\n${typedSince}` : content);
      latest.rememberFailedSend(key, { content, clientMessageId, attachmentIds: fileIds(files), mode });
      giveBackFiles(key, files, error instanceof ApiError ? error : undefined);

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
      // the files attached in this composer, in order (sending waits until each is in the library)
      const files = useAttachmentsStore.getState().byComposer[key] ?? [];
      // as the switch stands when Send is pressed
      const mode: RunMode = store.planMode ? "plan" : "default";
      // The same text and files sent again after a failure, in the same mode, keep their id, so a first attempt
      // that did arrive isn't doubled. Different files, or the other mode, make it a different message.
      const failed = store.failedSends[key];
      const same = failed?.content === content && sameFiles(failed.attachmentIds, fileIds(files)) && (failed.mode ?? "default") === mode;
      const clientMessageId = same ? failed.clientMessageId : uuid();
      store.setDraft(key, "");
      useAttachmentsStore.getState().set(key, []);

      let targetId = chatId;
      if (!targetId) {
        try {
          targetId = (await createChat.mutateAsync()).id;
        } catch (error) {
          store.setDraft(key, content);
          giveBackFiles(key, files);
          if (!(error instanceof ApiError)) throw error;
          if (error.status === 401) throw error;
          toast.error("Couldn't start the task", { description: explain(error) });
          return;
        }
      }

      // a Stop left over from an earlier send whose run never showed up must not cancel this one
      store.clearStopRequest(targetId);
      store.addOptimistic({
        clientMessageId,
        chatId: targetId,
        content,
        createdAt: new Date().toISOString(),
        attachments: files.flatMap((file) => (file.asset ? [{ ...file.asset, expired: false }] : [])),
      });
      if (!chatId) router.push(`/chat/${encodeURIComponent(targetId)}`);
      // Once the task exists, a failure belongs to ITS composer: we are on its page by now, not on home.
      await sendTo(targetId, content, clientMessageId, chatId ? key : targetId, files, mode);
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

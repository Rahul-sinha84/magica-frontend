"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Composer } from "@/components/composer/Composer";
import { useChat } from "@/hooks/useChat";
import { useMessages } from "@/hooks/useMessages";
import { useAgentStream } from "@/hooks/useAgentStream";
import { useRunChecked } from "@/hooks/useRunWatcher";
import { useSendMessage } from "@/hooks/useSendMessage";
import { useStopRun } from "@/hooks/useStopRun";
import { useChatStore } from "@/stores/chatStore";
import { chatTitle } from "@/lib/utils";
import { ApiError } from "@/lib/queryClient";
import { ChatHeader } from "./ChatHeader";
import { MessageList } from "./MessageList";

const NO_PENDING: never[] = [];

// One task: its history, the composer, and the reply being waited for.
export function ChatWindow({ chatId }: { chatId: string }) {
  const { data: chat, error } = useChat(chatId);
  const { messages, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } = useMessages(chatId);
  const text = useChatStore((state) => state.drafts[chatId] ?? "");
  const setDraft = useChatStore((state) => state.setDraft);
  const optimistic = useChatStore((state) => state.optimistic[chatId] ?? NO_PENDING);
  const running = useChatStore((state) => !!state.runs[chatId]);
  const { send, isSending } = useSendMessage(chatId);
  const stop = useStopRun(chatId);
  const stream = useAgentStream(chatId);
  // Until the server has said whether a run is going (after a reload, a reply may still be on its way), nothing
  // new is sent, and when the conversation ends on the user's own message, the reply's "Thinking" row shows.
  // The server leaves unfinished replies out of the history, so such a message is still being answered.
  const checked = useRunChecked(chatId);
  // our own messages stay on screen until the server's copy (same clientMessageId) is in the list
  const pending = useMemo(() => {
    const confirmed = new Set(messages.map((m) => m.clientMessageId).filter(Boolean));
    return optimistic.filter((p) => !confirmed.has(p.clientMessageId));
  }, [messages, optimistic]);
  // only the server saying "not found" counts; a failed request shouldn't claim the task is gone
  const missing = error instanceof ApiError && error.status === 404;
  const awaitingReply = !checked && !stream && pending.length === 0 && messages.at(-1)?.role === "USER";

  useEffect(() => {
    document.title = chat ? `${chatTitle(chat)} | Magica` : "Magica";
  }, [chat]);

  if (missing) {
    return (
      <div className="flex min-w-0 flex-1 flex-col">
        <ChatHeader />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <h1 className="text-xl font-bold text-text-primary">This task doesn&apos;t exist</h1>
          <p className="text-sm text-text-secondary">It may have been deleted, or the link is wrong.</p>
          <Button asChild>
            <Link href="/chat">New task</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <ChatHeader showFiles busy={running} />
      {/* the page's heading, for screen readers: the task's name */}
      <h1 className="sr-only">{chat ? chatTitle(chat) : "Task"}</h1>
      {isLoading && messages.length === 0 ? (
        <div className="min-h-0 flex-1" aria-busy="true" />
      ) : (
        <MessageList
          messages={messages}
          pending={pending}
          stream={stream}
          awaitingReply={awaitingReply}
          hasOlder={!!hasNextPage}
          isLoadingOlder={isFetchingNextPage}
          onLoadOlder={() => void fetchNextPage()}
        />
      )}
      <div className="flex justify-center px-2 pb-1 pt-2 sm:px-4 md:px-6 lg:px-8">
        <Composer
          value={text}
          onChange={(value) => setDraft(chatId, value)}
          placeholder="Send a message…"
          onSubmit={() => send(text)}
          onStop={() => stop.mutate()}
          // while a message is on its way the run isn't known yet, but Stop already works: it cancels the run the moment it starts
          running={running || isSending || pending.length > 0}
          sending={isSending}
          stopping={stream?.phase === "stopping"}
          blocked={!checked}
        />
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Composer } from "@/components/composer/Composer";
import { useChats } from "@/hooks/useChats";
import { ChatHeader } from "./ChatHeader";

// Phase 3 shell: header, an empty conversation area and the composer. Messages arrive in phase 4.
export function ChatWindow({ chatId }: { chatId: string }) {
  const { data: chats, isFetching } = useChats();
  const chat = chats?.find((c) => c.id === chatId);
  const [text, setText] = useState("");

  useEffect(() => {
    document.title = chat ? `${chat.title} | Magica` : "Magica";
  }, [chat]);

  // the list is fresh and doesn't have this chat: it was deleted, or the link is wrong
  if (chats && !chat && !isFetching) {
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
      <ChatHeader showFiles />
      <div className="min-h-0 flex-1" />
      <div className="flex justify-center px-4 pb-2 pt-2">
        <Composer value={text} onChange={setText} placeholder="Send a message…" />
      </div>
    </div>
  );
}

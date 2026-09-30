"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Composer } from "@/components/composer/Composer";
import { useChat } from "@/hooks/useChat";
import { chatTitle } from "@/lib/utils";
import { ApiError } from "@/lib/queryClient";
import { ChatHeader } from "./ChatHeader";

// Phase 3 shell: header, an empty conversation area and the composer. Messages arrive in phase 4.
export function ChatWindow({ chatId }: { chatId: string }) {
  const { data: chat, error } = useChat(chatId);
  const [text, setText] = useState("");
  // only the server saying "not found" counts; a failed request shouldn't claim the task is gone
  const missing = error instanceof ApiError && error.status === 404;

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
      <ChatHeader showFiles />
      <div className="min-h-0 flex-1" />
      <div className="flex justify-center px-4 pb-2 pt-2">
        <Composer value={text} onChange={setText} placeholder="Send a message…" />
      </div>
    </div>
  );
}

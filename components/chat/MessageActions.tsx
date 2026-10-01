"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Coins, Copy, GitFork, ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { RefreshIcon } from "@/components/icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRetryRun } from "@/hooks/useRetryRun";
import { copyText, creditsUsed } from "@/lib/blocks";
import { cn, formatMessageTime, formatCredits } from "@/lib/utils";
import { useChatStore } from "@/stores/chatStore";
import type { Message } from "@/types";

const button =
  "flex size-7 items-center justify-center rounded-[10px] text-text-secondary outline-none hover:bg-surface-secondary focus-visible:ring-2 focus-visible:ring-ring";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // no clipboard (an insecure page), or permission was refused
      toast.error("Couldn't copy to the clipboard");
    }
  }

  return (
    <button type="button" aria-label={copied ? "Copied" : "Copy"} onClick={copy} className={button}>
      {copied ? <Check className="size-[18px]" /> : <Copy className="size-[18px]" />}
    </button>
  );
}

// Retry on the one reply the backend says can be retried (the latest turn, failed or stopped). It sits in
// the always-visible action row, since it's the way to recover. It's gone while anything is running or being
// sent in this task, and it can't be pressed twice while the request is on its way.
function RetryButton({ chatId, runId }: { chatId: string; runId: string }) {
  const busy = useChatStore((s) => !!s.runs[chatId] || (s.optimistic[chatId] ?? []).length > 0);
  const { retry, isRetrying } = useRetryRun(chatId);
  if (busy) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label="Retry" disabled={isRetrying} onClick={() => retry(runId)} className={cn(button, "disabled:cursor-default disabled:opacity-50")}>
          <RefreshIcon className={cn("size-[18px]", isRetrying && "animate-spin motion-reduce:animate-none")} />
        </button>
      </TooltipTrigger>
      <TooltipContent>Retry</TooltipContent>
    </Tooltip>
  );
}

// Under an assistant reply: what it cost, copy, and the time. Branching and feedback aren't in this build.
export function MessageActions({ message }: { message: Message }) {
  const credits = creditsUsed(message.contentBlocks);
  const text = copyText(message);
  const inert = { type: "button" as const, title: "Not available in this build", "aria-disabled": true };

  return (
    <div className="mt-3">
      {credits > 0 && (
        <p className="flex items-center gap-1 text-[10px] leading-3 text-text-secondary">
          <Coins className="size-3" aria-hidden="true" />
          {formatCredits(credits)} credits
        </p>
      )}
      <div className={cn("flex items-center gap-0.5", credits > 0 && "mt-1")}>
        <div className="-ml-2.5 flex items-center gap-0.5">
          {message.canRetry === true && message.agentRunId && <RetryButton chatId={message.chatId} runId={message.agentRunId} />}
          {text && <CopyButton text={text} />}
          <button aria-label="Branch from here" className={button} {...inert}>
            <GitFork className="size-[18px]" />
          </button>
          <button aria-label="Good response" className={button} {...inert}>
            <ThumbsUp className="size-[18px]" />
          </button>
          <button aria-label="Bad response" className={button} {...inert}>
            <ThumbsDown className="size-[18px]" />
          </button>
        </div>
        <time dateTime={message.createdAt} className="ml-4 text-xs font-medium">
          {formatMessageTime(message.createdAt)}
        </time>
      </div>
    </div>
  );
}

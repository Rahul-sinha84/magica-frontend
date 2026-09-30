"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Coins, Copy, GitFork, ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { copyText, creditsUsed } from "@/lib/blocks";
import { cn, formatClockTime, formatCredits } from "@/lib/utils";
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
          {formatClockTime(message.createdAt)}
        </time>
      </div>
    </div>
  );
}

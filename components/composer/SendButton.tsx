"use client";

import { ArrowUp, Loader2, Square } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  // a reply is being written: the button becomes Stop
  running: boolean;
  // the message is on its way to the server
  sending: boolean;
  canSend: boolean;
  onSend: () => void;
  onStop: () => void;
}

const base =
  "flex size-8 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function SendButton({ running, sending, canSend, onSend, onStop }: Props) {
  if (running) {
    return (
      <button type="button" aria-label="Stop response" onClick={onStop} className={cn(base, "bg-destructive/15 text-destructive hover:bg-destructive/25")}>
        <Square className="size-3.5 fill-current" />
      </button>
    );
  }
  if (sending) {
    return (
      <button type="button" aria-label="Sending" disabled className={cn(base, "bg-surface-main-2 text-text-secondary")}>
        <Loader2 className="size-4 animate-spin" />
      </button>
    );
  }
  return (
    <button
      type="button"
      aria-label="Send message"
      disabled={!canSend}
      onClick={onSend}
      className={cn(
        base,
        "bg-surface-main-2 text-text-secondary hover:bg-surface-secondary disabled:cursor-not-allowed disabled:text-text-disabled disabled:hover:bg-surface-main-2",
        canSend && "bg-primary text-primary-foreground hover:bg-primary/85",
      )}
    >
      <ArrowUp className="size-4" />
    </button>
  );
}

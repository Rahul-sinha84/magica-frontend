"use client";

import { Mic, Paperclip } from "lucide-react";
import { PlugIcon } from "@/components/icons";
import { MAX_MESSAGE_LENGTH } from "@/lib/limits";
import { cn } from "@/lib/utils";
import { ComposerTextarea } from "./ComposerTextarea";
import { OpenRouterStatus } from "./OpenRouterStatus";
import { SendButton } from "./SendButton";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  // without this the composer is display-only
  onSubmit?: () => void;
  onStop?: () => void;
  // a reply is being written: sending waits, and the button offers Stop
  running?: boolean;
  // the message is on its way to the server
  sending?: boolean;
  // Stop was accepted and the server is winding the run down
  stopping?: boolean;
  autoFocus?: boolean;
}

const INERT = "Not available in this build";
const action =
  "flex shrink-0 items-center justify-center rounded-full text-icon-secondary outline-none hover:bg-surface-secondary focus-visible:ring-2 focus-visible:ring-ring";

export function Composer({ value, onChange, placeholder, onSubmit, onStop, running = false, sending = false, stopping = false, autoFocus }: Props) {
  const tooLong = value.length > MAX_MESSAGE_LENGTH;
  const canSend = !!onSubmit && value.trim().length > 0 && !tooLong && !running && !sending;

  return (
    <div className="flex min-h-[132px] w-full max-w-[900px] flex-col gap-3 rounded-3xl bg-gradient-to-b from-surface-primary to-surface-main px-4 pb-3 pt-4 shadow-[0_0_0_1px_var(--line-tertiary)]">
      <ComposerTextarea
        value={value}
        onChange={onChange}
        // Enter belongs to sending even when sending isn't possible right now (a reply is being written, the
        // box is empty): it does nothing then, rather than slipping a new line into the next message
        onSubmit={onSubmit && (() => canSend && onSubmit())}
        placeholder={placeholder}
        autoFocus={autoFocus}
      />
      {value.length >= MAX_MESSAGE_LENGTH * 0.9 && (
        <p
          role={tooLong ? "alert" : undefined}
          className={cn("text-right text-xs tabular-nums", tooLong ? "text-destructive" : "text-text-tertiary")}
        >
          {tooLong && "Message is too long · "}
          {value.length.toLocaleString("en-US")} / {MAX_MESSAGE_LENGTH.toLocaleString("en-US")}
        </p>
      )}
      <div className="mt-auto flex items-center gap-1">
        <button type="button" aria-label="Attach files" title={INERT} aria-disabled="true" className={cn(action, "size-8")}>
          <Paperclip className="size-4" />
        </button>
        <button type="button" aria-label="Connect apps" title={INERT} aria-disabled="true" className={cn(action, "size-8")}>
          <PlugIcon className="size-5 -rotate-45" />
        </button>
        <OpenRouterStatus />
        <div className="ml-auto flex items-center gap-0.5">
          <button type="button" aria-label="Dictation" title={INERT} aria-disabled="true" className={cn(action, "size-[34px]")}>
            <Mic className="size-4" />
          </button>
          <SendButton running={running} sending={sending} stopping={stopping} canSend={canSend} onSend={() => onSubmit?.()} onStop={() => onStop?.()} />
        </div>
      </div>
    </div>
  );
}

"use client";

import { ArrowUp, Mic, Paperclip } from "lucide-react";
import { PlugIcon } from "@/components/icons";
import { MAX_MESSAGE_LENGTH } from "@/lib/limits";
import { cn } from "@/lib/utils";
import { ComposerTextarea } from "./ComposerTextarea";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  // without this the composer is display-only
  onSubmit?: () => void;
  autoFocus?: boolean;
}

const INERT = "Not available in this build";
const action =
  "flex shrink-0 items-center justify-center rounded-full text-icon-secondary outline-none hover:bg-surface-secondary focus-visible:ring-2 focus-visible:ring-ring";

export function Composer({ value, onChange, placeholder, onSubmit, autoFocus }: Props) {
  const tooLong = value.length > MAX_MESSAGE_LENGTH;
  const canSend = !!onSubmit && value.trim().length > 0 && !tooLong;

  return (
    <div className="flex min-h-[132px] w-full max-w-[900px] flex-col gap-3 rounded-3xl bg-gradient-to-b from-surface-primary to-surface-main px-4 pb-3 pt-4 shadow-[0_0_0_1px_var(--line-tertiary)]">
      <ComposerTextarea
        value={value}
        onChange={onChange}
        onSubmit={canSend ? onSubmit : undefined}
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
        <div className="ml-auto flex items-center gap-0.5">
          <button type="button" aria-label="Dictation" title={INERT} aria-disabled="true" className={cn(action, "size-[34px]")}>
            <Mic className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Send message"
            disabled={!canSend}
            onClick={onSubmit}
            className={cn(
              action,
              "size-8 bg-surface-main-2 disabled:cursor-not-allowed disabled:text-text-disabled disabled:hover:bg-surface-main-2",
              canSend && "bg-primary text-primary-foreground hover:bg-primary/85",
            )}
          >
            <ArrowUp className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

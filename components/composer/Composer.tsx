"use client";

import { useRef, useState } from "react";
import { Mic, Paperclip } from "lucide-react";
import { PlugIcon } from "@/components/icons";
import { MediaLibraryDialog } from "@/components/media/MediaLibraryDialog";
import { allReady } from "@/hooks/useAttachments";
import { MAX_MESSAGE_LENGTH } from "@/lib/limits";
import { cn } from "@/lib/utils";
import type { Attachment } from "@/stores/attachmentsStore";
import { useChatStore } from "@/stores/chatStore";
import type { MediaAsset } from "@/types";
import { AttachMenu } from "./AttachMenu";
import { AttachmentChips } from "./AttachmentChips";
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
  // nothing can be sent yet: the server hasn't said whether a reply is still being written here
  blocked?: boolean;
  autoFocus?: boolean;
  // files to go with the message; without this the paperclip does nothing
  attachments?: {
    items: Attachment[];
    onPickFiles: (files: File[]) => void;
    onPickAsset: (asset: MediaAsset) => void;
    onRemove: (id: string) => void;
    onRetry: (id: string) => void;
    onOpen?: (item: Attachment) => void;
  };
}

const INERT = "Not available in this build";
export const PLAN_PLACEHOLDER = "Plan mode — describe what you want planned...";
const PLAN_TITLE = "Plan mode active — agent can research and estimate; generation waits for approval. Press Shift+Tab to toggle.";
const action =
  "flex shrink-0 items-center justify-center rounded-full text-icon-secondary outline-none hover:bg-surface-secondary focus-visible:ring-2 focus-visible:ring-ring";

export function Composer({ value, onChange, placeholder, onSubmit, onStop, running = false, sending = false, stopping = false, blocked = false, autoFocus, attachments }: Props) {
  const tooLong = value.length > MAX_MESSAGE_LENGTH;
  // a file still uploading, failed or expired holds the message back
  const filesReady = !attachments || allReady(attachments.items);
  const canSend = !!onSubmit && value.trim().length > 0 && !tooLong && !running && !sending && !blocked && filesReady;
  const [libraryOpen, setLibraryOpen] = useState(false);
  const paperclipRef = useRef<HTMLButtonElement>(null);
  // plan mode belongs to composers that can send
  const planMode = useChatStore((s) => s.planMode) && !!onSubmit;
  const setPlanMode = useChatStore((s) => s.setPlanMode);

  return (
    <div className="flex min-h-[132px] w-full max-w-[900px] flex-col gap-3 rounded-3xl bg-gradient-to-b from-surface-primary to-surface-main px-4 pb-3 pt-4 shadow-[0_0_0_1px_var(--line-tertiary)]">
      {attachments && (
        <AttachmentChips items={attachments.items} onRemove={attachments.onRemove} onRetry={attachments.onRetry} onOpen={attachments.onOpen} />
      )}
      <ComposerTextarea
        value={value}
        onChange={onChange}
        // Enter belongs to sending even when sending isn't possible right now (a reply is being written, the
        // box is empty): it does nothing then, rather than slipping a new line into the next message
        onSubmit={onSubmit && (() => canSend && onSubmit())}
        onShiftTab={onSubmit && (() => setPlanMode(!planMode))}
        placeholder={planMode ? PLAN_PLACEHOLDER : placeholder}
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
        {attachments ? (
          <AttachMenu triggerRef={paperclipRef} onPickFiles={attachments.onPickFiles} onSelectAsset={() => setLibraryOpen(true)} />
        ) : (
          <button type="button" aria-label="Attach files" title={INERT} aria-disabled="true" className={cn(action, "size-8")}>
            <Paperclip className="size-4" />
          </button>
        )}
        <button type="button" aria-label="Connect apps" title={INERT} aria-disabled="true" className={cn(action, "size-8")}>
          <PlugIcon className="size-5 -rotate-45" />
        </button>
        {planMode && (
          // magica's amber chip; clicking it turns plan mode off
          <button
            type="button"
            title={PLAN_TITLE}
            aria-pressed="true"
            onClick={() => setPlanMode(false)}
            className="flex h-7 shrink-0 items-center gap-1 rounded-full bg-plan-surface px-2.5 text-xs font-medium text-plan-text outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
            Plan
          </button>
        )}
        <OpenRouterStatus />
        <div className="ml-auto flex items-center gap-0.5">
          <button type="button" aria-label="Dictation" title={INERT} aria-disabled="true" className={cn(action, "size-[34px]")}>
            <Mic className="size-4" />
          </button>
          <SendButton running={running} sending={sending} stopping={stopping} canSend={canSend} onSend={() => onSubmit?.()} onStop={() => onStop?.()} />
        </div>
      </div>
      {attachments && (
        <MediaLibraryDialog
          open={libraryOpen}
          onOpenChange={setLibraryOpen}
          returnFocusTo={paperclipRef}
          onPick={(asset) => {
            attachments.onPickAsset(asset);
            setLibraryOpen(false);
          }}
        />
      )}
    </div>
  );
}

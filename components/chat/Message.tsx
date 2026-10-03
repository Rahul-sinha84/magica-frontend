"use client";

import { memo, useState } from "react";
import { AlertCircle, Download, Film, Music, TimerOff } from "lucide-react";
import { downloadFiles, fileNameFor } from "@/lib/download";
import { useRetryRun } from "@/hooks/useRetryRun";
import { previewBlock } from "@/lib/uploadFiles";
import { formatMessageTime, safeAssetUrl } from "@/lib/utils";
import { useChatStore } from "@/stores/chatStore";
import type { ContentBlock, Message as MessageData } from "@/types";
import { CopyButton, MessageActions } from "./MessageActions";
import { MessageContent } from "./MessageContent";

const tile = "flex size-[60px] items-center justify-center overflow-hidden rounded-[10px] bg-surface-secondary text-text-secondary";

// The files a message carries, above its text and in the order they were attached: a picture (or video) opens in
// the preview; audio is a tile. A file the upload service has since deleted shows as expired, not as a broken image.
function Attachments({ message }: { message: MessageData }) {
  const open = useChatStore((s) => s.openArtifactPanel);
  const files = message.attachments ?? [];
  if (files.length === 0) return null;
  return (
    <ul aria-label="Attached files" className="mb-2 flex max-w-[448px] flex-wrap justify-end gap-2">
      {files.map((file) => {
        const name = file.name ?? file.prompt ?? "Attached file";
        const block = previewBlock(file);
        const src = safeAssetUrl(file.url);
        if (file.expired) {
          return (
            <li key={file.id}>
              <div role="img" aria-label={`${name}: file expired`} title={name} className={`${tile} flex-col gap-0.5 text-center text-[10px] font-medium leading-3`}>
                <TimerOff className="size-4" aria-hidden="true" />
                File expired
              </div>
            </li>
          );
        }
        if (block && src) {
          return (
            <li key={file.id}>
              <button
                type="button"
                aria-label={`Open ${name}`}
                title={name}
                onClick={() => open({ chatId: message.chatId, asset: block, createdAt: file.createdAt, openedBy: "user", source: file.source, name: file.name })}
                className={`${tile} cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring`}
              >
                {file.type === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element -- files come from anywhere
                  <img src={src} alt={name} loading="lazy" className="size-full object-cover" />
                ) : (
                  <Film className="size-5" aria-hidden="true" />
                )}
              </button>
            </li>
          );
        }
        return (
          <li key={file.id}>
            <div role="img" aria-label={`Audio: ${name}`} title={name} className={tile}>
              <Music className="size-5" aria-hidden="true" />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function UserMessage({ message, pending }: { message: MessageData; pending: boolean }) {
  return (
    <div className="group/message flex flex-col items-end">
      <Attachments message={message} />
      <div className="max-w-[448px] whitespace-pre-wrap break-words rounded-2xl bg-[#f4f4f4] px-4 py-1.5 text-sm leading-5 text-text-primary dark:bg-surface-tertiary">
        {message.content}
      </div>
      {!pending && (
        <div className="mt-1 flex items-center gap-1.5 transition-opacity focus-within:opacity-100 sm:opacity-0 sm:group-hover/message:opacity-100 [@media(hover:none)]:opacity-100">
          <time dateTime={message.createdAt} className="text-xs font-medium text-text-primary">
            {formatMessageTime(message.createdAt)}
          </time>
          {message.content && <CopyButton text={message.content} />}
        </div>
      )}
    </div>
  );
}

// magica's "Retry" inside the status box: only on the reply the backend says can be retried (the latest turn,
// failed or stopped), gone while anything runs or is being sent in this task, and not pressable twice.
function RetryButton({ chatId, runId }: { chatId: string; runId: string }) {
  const busy = useChatStore((s) => !!s.runs[chatId] || (s.optimistic[chatId] ?? []).length > 0);
  const { retry, isRetrying } = useRetryRun(chatId);
  if (busy) return null;
  return (
    <button
      type="button"
      disabled={isRetrying}
      onClick={() => retry(runId)}
      className="shrink-0 rounded-[4px] border border-line-tertiary bg-surface-main px-3 py-1 text-xs font-medium text-text-secondary outline-none hover:bg-surface-secondary focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-50"
    >
      Retry
    </button>
  );
}

// A reply that failed or was stopped, as magica shows it: a quiet box with the reason, and Retry when it can be.
function StatusBox({ message }: { message: MessageData }) {
  const failed = message.status === "FAILED";
  const text = failed ? message.errorMessage || "Something went wrong while writing this response." : "Response was interrupted";
  return (
    <div
      role={failed ? "alert" : undefined}
      className="mt-3 flex items-center gap-2.5 rounded-[10px] border border-line-tertiary bg-surface-main-2 px-4 py-2.5 first:mt-0"
    >
      <AlertCircle className="size-4 shrink-0 text-text-tertiary" aria-hidden="true" />
      <span className="min-w-0 flex-1 text-sm text-text-tertiary">{text}</span>
      {message.canRetry === true && message.agentRunId && <RetryButton chatId={message.chatId} runId={message.agentRunId} />}
    </div>
  );
}

// The pictures and videos a reply made, once each, that are safe to fetch.
function mediaOf(blocks: readonly ContentBlock[]) {
  const seen = new Set<string>();
  return blocks.flatMap((block) => {
    if (block.type !== "image" && block.type !== "video") return [];
    const url = safeAssetUrl(block.url);
    if (!url || seen.has(url)) return [];
    seen.add(url);
    return [{ url, mimeType: block.mimeType }];
  });
}

// magica's "Download all", under a reply that made two or more pictures or videos: it saves each of them.
function DownloadAll({ blocks }: { blocks: readonly ContentBlock[] }) {
  const [busy, setBusy] = useState(false);
  const media = mediaOf(blocks);
  if (media.length < 2) return null;
  async function download() {
    setBusy(true);
    try {
      await downloadFiles(media.map((file, i) => ({ url: file.url, name: fileNameFor(file.url, i, file.mimeType) })));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-3 flex items-center justify-end">
      <button
        type="button"
        aria-label={`Download all ${media.length} generated assets`}
        disabled={busy}
        onClick={download}
        className="flex h-[30px] items-center gap-1.5 rounded-[10px] border border-line-tertiary bg-surface-main px-3 text-xs font-medium text-text-primary outline-none hover:bg-surface-primary focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      >
        <Download className="size-3.5" aria-hidden="true" />
        {busy ? "Downloading…" : "Download all"}
      </button>
    </div>
  );
}

function AssistantMessage({ message, latest }: { message: MessageData; latest: boolean }) {
  const { status, contentBlocks } = message;
  // a plain-text reply with no blocks still has its content
  const blocks = contentBlocks.length > 0 || !message.content ? contentBlocks : [{ type: "text" as const, content: message.content }];
  const hasContent = blocks.some((block) => block.type !== "usage" && block.type !== "thinking" && !(block.type === "text" && !block.content.trim()));

  return (
    <div className="group/message">
      {hasContent && <MessageContent blocks={blocks} chatId={message.chatId} createdAt={message.createdAt} />}
      {status !== "STREAMING" && <DownloadAll blocks={blocks} />}
      {status === "COMPLETED" && !hasContent && (
        // a finished reply with nothing in it: say so, rather than show a lone row of buttons
        <p className="text-sm text-text-secondary">No response.</p>
      )}
      {(status === "FAILED" || status === "CANCELLED") && <StatusBox message={message} />}
      {status !== "STREAMING" && <MessageActions message={message} latest={latest} />}
    </div>
  );
}

// `pending` is a message the server hasn't confirmed yet: it looks the same, minus its actions.
// `latest` is the newest reply in the task: its footer stays visible, as on magica.
export const Message = memo(function Message({ message, pending = false, latest = false }: { message: MessageData; pending?: boolean; latest?: boolean }) {
  if (message.role === "USER") return <UserMessage message={message} pending={pending} />;
  if (message.role === "ASSISTANT") return <AssistantMessage message={message} latest={latest} />;
  return null; // system and tool messages are for the model, not the reader
});

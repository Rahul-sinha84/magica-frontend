"use client";

import { memo } from "react";
import { AlertCircle } from "lucide-react";
import { useRetryRun } from "@/hooks/useRetryRun";
import { formatMessageTime } from "@/lib/utils";
import { useChatStore } from "@/stores/chatStore";
import type { Message as MessageData } from "@/types";
import { CopyButton, MessageActions } from "./MessageActions";
import { MessageContent } from "./MessageContent";

function UserMessage({ message, pending }: { message: MessageData; pending: boolean }) {
  return (
    <div className="group/message flex flex-col items-end">
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

function AssistantMessage({ message, latest }: { message: MessageData; latest: boolean }) {
  const { status, contentBlocks } = message;
  // a plain-text reply with no blocks still has its content
  const blocks = contentBlocks.length > 0 || !message.content ? contentBlocks : [{ type: "text" as const, content: message.content }];
  const hasContent = blocks.some((block) => block.type !== "usage" && block.type !== "thinking" && !(block.type === "text" && !block.content.trim()));

  return (
    <div className="group/message">
      {hasContent && <MessageContent blocks={blocks} chatId={message.chatId} createdAt={message.createdAt} />}
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

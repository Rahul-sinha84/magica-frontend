"use client";

import { memo } from "react";
import { AlertCircle, CircleSlash } from "lucide-react";
import { formatClockTime } from "@/lib/utils";
import type { Message as MessageData } from "@/types";
import { CopyButton, MessageActions } from "./MessageActions";
import { MessageContent } from "./MessageContent";

function UserMessage({ message, pending }: { message: MessageData; pending: boolean }) {
  return (
    <div className="group flex flex-col items-end">
      <div className="max-w-[448px] whitespace-pre-wrap break-words rounded-2xl bg-[#f4f4f4] px-4 py-1.5 text-sm leading-5 text-text-primary dark:bg-surface-tertiary">
        {message.content}
      </div>
      {!pending && (
        <div className="mt-1 flex items-center gap-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
          {message.content && <CopyButton text={message.content} />}
          <time dateTime={message.createdAt} className="text-xs font-medium text-text-secondary">
            {formatClockTime(message.createdAt)}
          </time>
        </div>
      )}
    </div>
  );
}

function AssistantMessage({ message }: { message: MessageData }) {
  const { status, contentBlocks } = message;
  // a plain-text reply with no blocks still has its content
  const blocks = contentBlocks.length > 0 || !message.content ? contentBlocks : [{ type: "text" as const, content: message.content }];

  return (
    <div>
      <MessageContent blocks={blocks} />
      {status === "FAILED" && (
        <p role="alert" className="mt-4 flex items-center gap-1.5 text-sm text-destructive">
          <AlertCircle className="size-4" aria-hidden="true" />
          {message.errorMessage || "Something went wrong while writing this response."}
        </p>
      )}
      {status === "CANCELLED" && (
        <p className="mt-4 flex items-center gap-1.5 text-sm text-text-secondary">
          <CircleSlash className="size-4" aria-hidden="true" />
          Stopped
        </p>
      )}
      {status !== "STREAMING" && <MessageActions message={message} />}
    </div>
  );
}

// `pending` is a message the server hasn't confirmed yet: it looks the same, minus its actions.
export const Message = memo(function Message({ message, pending = false }: { message: MessageData; pending?: boolean }) {
  if (message.role === "USER") return <UserMessage message={message} pending={pending} />;
  if (message.role === "ASSISTANT") return <AssistantMessage message={message} />;
  return null; // system and tool messages are for the model, not the reader
});

"use client";

import { memo } from "react";
import type { AgentStream } from "@/hooks/useAgentStream";
import { MessageContent } from "./MessageContent";
import { TypingIndicator } from "./TypingIndicator";

// The reply while it is being written: the same pieces as a saved reply, fed from the stream, with no
// actions under it yet. "Thinking" leads until the model starts on anything else.
export const StreamingMessage = memo(function StreamingMessage({ stream }: { stream: AgentStream }) {
  const { blocks, phase } = stream;
  const hasThinking = blocks.some((block) => block.type === "thinking");
  return (
    // The conversation announces new messages. This row changes many times a second, so it stays quiet;
    // the saved reply is announced once when it lands.
    <div aria-busy="true" aria-live="off">
      {(blocks.length === 0 || (phase === "thinking" && !hasThinking)) && <TypingIndicator />}
      {blocks.length > 0 && (
        <div className={blocks.length > 0 && phase === "thinking" && !hasThinking ? "mt-4" : undefined}>
          <MessageContent blocks={blocks} thinkingActive={phase === "thinking"} chatId={stream.chatId} />
        </div>
      )}
      {phase === "stopping" && <p className="mt-3 text-sm text-text-secondary">Stopping…</p>}
      {stream.reconnecting && (
        <p role="status" className="mt-3 text-sm text-text-secondary">
          Connection lost. Reconnecting…
        </p>
      )}
    </div>
  );
});

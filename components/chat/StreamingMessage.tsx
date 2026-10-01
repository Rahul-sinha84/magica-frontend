"use client";

import { memo, useEffect, useState } from "react";
import type { AgentStream } from "@/hooks/useAgentStream";
import { QUEUED_NOTICE_MS } from "@/lib/timing";
import { MessageContent } from "./MessageContent";
import { TypingIndicator } from "./TypingIndicator";

// The reply while it is being written: the same pieces as a saved reply, fed from the stream, with no
// actions under it yet. "Thinking" leads until the model starts on anything else.
export const StreamingMessage = memo(function StreamingMessage({ stream }: { stream: AgentStream }) {
  const { blocks, phase } = stream;
  const hasThinking = blocks.some((block) => block.type === "thinking");
  // A queued turn looks like "thinking" at first, since most start within seconds. If it is still waiting
  // after a while, a note says why.
  const waiting = phase === "waiting";
  const [waitedLong, setWaitedLong] = useState(false);
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => setWaitedLong(true), QUEUED_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [waiting]);
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
      {waiting && waitedLong && (
        <p role="status" className="mt-3 text-sm text-text-secondary">
          Lots of people are using the assistant right now. Your message is queued and will start shortly.
        </p>
      )}
      {phase === "stopping" && <p className="mt-3 text-sm text-text-secondary">Stopping…</p>}
      {phase !== "stopping" && stream.runningTool && (
        // what the agent is doing right now, from the run's metadata; gone when the tool finishes
        <p role="status" className="mt-3 text-sm text-text-secondary">
          <span className="thinking-shimmer">Running {stream.runningTool}…</span>
        </p>
      )}
      {stream.reconnecting && (
        <p role="status" className="mt-3 text-sm text-text-secondary">
          Connection lost. Reconnecting…
        </p>
      )}
    </div>
  );
});

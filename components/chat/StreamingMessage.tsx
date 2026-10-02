"use client";

import { memo, useEffect, useState } from "react";
import type { AgentStream } from "@/hooks/useAgentStream";
import { QUEUED_NOTICE_MS } from "@/lib/timing";
import { MessageContent } from "./MessageContent";
import { TypingIndicator } from "./TypingIndicator";

// The reply while it is being written: the same pieces as a saved reply, fed from the stream, with no
// actions under it yet. magica's "Thinking" row leads until the model starts on anything else (a step, or
// text). The step being run shows as its own row with a spinner, so there is no separate "Running …" line.
export const StreamingMessage = memo(function StreamingMessage({ stream }: { stream: AgentStream }) {
  const { blocks, phase } = stream;
  // what the reply shows besides thinking (steps, text, media); until there is some, the "Thinking" row leads
  const shown = blocks.some((block) => block.type !== "thinking" && block.type !== "usage" && !(block.type === "text" && !block.content.trim()));
  const reasoning = blocks.map((block) => (block.type === "thinking" ? block.content : "")).filter(Boolean).join("\n\n");
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
      {!shown && phase !== "stopping" && <TypingIndicator reasoning={reasoning} />}
      {shown && <MessageContent blocks={blocks} chatId={stream.chatId} live />}
      {waiting && waitedLong && (
        <p role="status" className="mt-3 text-sm text-text-secondary">
          Lots of people are using the assistant right now. Your message is queued and will start shortly.
        </p>
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

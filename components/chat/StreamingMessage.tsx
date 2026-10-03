"use client";

import { memo, useEffect, useState } from "react";
import type { AgentStream } from "@/hooks/useAgentStream";
import { isHiddenStep } from "@/lib/blocks";
import { QUEUED_NOTICE_MS } from "@/lib/timing";
import { MessageContent } from "./MessageContent";
import { TypingIndicator } from "./TypingIndicator";

// The reply while it is being written: the same pieces as a saved reply, fed from the stream, with no
// actions under it yet. magica's "Thinking" row leads until the model starts on anything else (a step, or
// text). The step being run shows as its own row with a spinner, so there is no separate "Running …" line.

// magica shows no words while a plan waits; this says why nothing moves
export const WAITING_STATUS = "Waiting for your approval";

export const StreamingMessage = memo(function StreamingMessage({ stream }: { stream: AgentStream }) {
  const { blocks, phase } = stream;
  // what the reply shows besides thinking (steps, text, media); until there is some, the "Thinking" row leads. The
  // plan or spend it waits on is the card above the composer, not part of the reply yet.
  const visible = blocks.filter(
    (block) =>
      block.type !== "thinking" &&
      block.type !== "usage" &&
      !(block.type === "text" && !block.content.trim()) &&
      !(block.type === "waitpoint" && block.status === "pending") &&
      !isHiddenStep(block),
  );
  const shown = visible.length > 0;
  // just answered (a plan or a spend), and nothing has come of it yet: the model is at work again, so "Thinking"
  // shows under the answer until it does
  const last = visible.at(-1);
  const resuming = last?.type === "waitpoint" && (phase === "thinking" || phase === "writing");
  const reasoning = blocks.map((block) => (block.type === "thinking" ? block.content : "")).filter(Boolean).join("\n\n");
  // A queued turn looks like "thinking" at first, since most start within seconds. If it is still waiting
  // after a while, a note says why.
  const queued = phase === "queued";
  const [queuedLong, setQueuedLong] = useState(false);
  useEffect(() => {
    if (!queued) return;
    const timer = setTimeout(() => setQueuedLong(true), QUEUED_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [queued]);
  // the run waits for the user's answer (the card above the composer): nothing is being worked on meanwhile
  const waiting = phase === "waiting";
  return (
    // The conversation announces new messages. This row changes many times a second, so it stays quiet;
    // the saved reply is announced once when it lands.
    <div aria-busy="true" aria-live="off">
      {!shown && phase !== "stopping" && !waiting && <TypingIndicator reasoning={reasoning} />}
      {shown && <MessageContent blocks={blocks} chatId={stream.chatId} live paused={waiting} />}
      {resuming && (
        <div className="mt-1">
          <TypingIndicator />
        </div>
      )}
      {queued && queuedLong && (
        <p role="status" className="mt-3 text-sm text-text-secondary">
          Lots of people are using the assistant right now. Your message is queued and will start shortly.
        </p>
      )}
      {waiting && (
        <p role="status" className={shown ? "mt-3 text-sm text-text-secondary" : "text-sm text-text-secondary"}>
          {WAITING_STATUS}
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

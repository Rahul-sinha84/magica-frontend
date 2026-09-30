"use client";

import { useEffect, useMemo, useState } from "react";
import { useRealtimeRun, useRealtimeStream } from "@trigger.dev/react-hooks";
import { AGENT_STREAM_ID, AgentStreamChunkSchema, AgentStreamMetadataSchema, foldChunks, type AgentStreamChunk } from "@/contracts";
import { REALTIME_ENABLED, TRIGGER_API_URL } from "@/lib/config";
import { REALTIME_RETRY_MS, TOKEN_REFRESH_LEAD_MS } from "@/lib/timing";
import { useChatStore } from "@/stores/chatStore";
import type { ContentBlock } from "@/types";
import { useRunWatcher } from "./useRunWatcher";

// Trigger.dev statuses after which the run won't change again. Hearing one only makes us ask our server,
// which alone decides that the run is over.
const TRIGGER_FINISHED = new Set(["COMPLETED", "CANCELED", "FAILED", "CRASHED", "SYSTEM_FAILURE", "EXPIRED", "TIMED_OUT"]);
// setTimeout can't wait longer than this (about 24.8 days)
const MAX_TIMER_MS = 2 ** 31 - 1;

// Each chunk is checked once. The stream hands back the same objects on every update, so the check
// isn't repeated for the whole list as it grows (a long reply has thousands of chunks).
const checked = new WeakMap<object, AgentStreamChunk | null>();
function validChunk(part: unknown): AgentStreamChunk | null {
  if (typeof part !== "object" || part === null) return null;
  if (checked.has(part)) return checked.get(part)!;
  const parsed = AgentStreamChunkSchema.safeParse(part);
  const chunk = parsed.success ? (parsed.data as AgentStreamChunk) : null;
  checked.set(part, chunk);
  return chunk;
}

export type StreamPhase = "thinking" | "writing" | "stopping";

export interface AgentStream {
  // the reply so far; empty until something has arrived
  blocks: ContentBlock[];
  phase: StreamPhase;
  // true while the live stream is delivering; otherwise the screen follows the server's saved progress
  live: boolean;
  // the server couldn't be reached on the last check; it keeps trying
  reconnecting: boolean;
}

// How far along a reply is: its pieces, and the text inside them.
function progress(blocks: readonly ContentBlock[]) {
  return blocks.reduce((sum, block) => sum + 1 + ("content" in block && typeof block.content === "string" ? block.content.length : 0), 0);
}

// The server's saved progress: its blocks, or at least its text.
function partialOf(partial: { partialBlocks: ContentBlock[]; partialText: string | null } | null): ContentBlock[] {
  if (!partial) return [];
  if (partial.partialBlocks.length > 0) return partial.partialBlocks;
  return partial.partialText ? [{ type: "text", content: partial.partialText }] : [];
}

// The reply being written for this chat. Live from Trigger.dev when that works, from the server's
// saved progress (checked every couple of seconds) when it doesn't. Either way the run only ends when
// our server says so. Returns null when nothing is being written.
export function useAgentStream(chatId: string): AgentStream | null {
  const run = useChatStore((s) => s.runs[chatId]);
  const stopping = useChatStore((s) => !!s.stopping[chatId]);
  // bumped to try the live stream again after it failed
  const [attempt, setAttempt] = useState(0);

  const token = run?.realtimeToken ?? undefined;
  const triggerRunId = run?.triggerRunId ?? "";
  const enabled = REALTIME_ENABLED && !!run && !!triggerRunId && !!token;
  // A new token or a retry starts a fresh subscription. The stream replays from the start, and folding
  // the whole list again gives the same blocks, so nothing is doubled.
  const subscription = `${triggerRunId}:${token ?? ""}:${attempt}`;
  // a render every 50ms is plenty for text appearing, and keeps long replies cheap
  const options = { accessToken: token, baseURL: TRIGGER_API_URL, enabled, id: subscription, throttleInMs: 50 };

  const stream = useRealtimeStream<unknown>(triggerRunId, AGENT_STREAM_ID, { ...options, timeoutInSeconds: 600 });
  const realtime = useRealtimeRun(triggerRunId, options);

  // only chunks that match the contract are used; anything else is dropped rather than trusted
  const chunks = useMemo(
    () =>
      (enabled ? stream.parts : []).flatMap((part) => {
        const chunk = validChunk(part);
        return chunk ? [chunk] : [];
      }),
    [enabled, stream.parts],
  );
  const failed = enabled && !!(stream.error || realtime.error);
  const live = enabled && !failed && chunks.length > 0;

  const { partial, check, reconnecting } = useRunWatcher(chatId, { live });

  const metadata = useMemo(() => {
    const parsed = AgentStreamMetadataSchema.safeParse(enabled && !failed ? realtime.run?.metadata : undefined);
    return parsed.success ? parsed.data : null;
  }, [enabled, failed, realtime.run?.metadata]);

  // Trigger.dev says the run finished: ask the server now instead of at the next check
  const triggerStatus = enabled ? realtime.run?.status : undefined;
  useEffect(() => {
    if (triggerStatus && TRIGGER_FINISHED.has(triggerStatus)) check();
  }, [triggerStatus, check]);

  // the stream failed: polling has taken over; try the live stream again a little later
  useEffect(() => {
    if (!failed) return;
    const timer = setTimeout(() => setAttempt((n) => n + 1), REALTIME_RETRY_MS);
    return () => clearTimeout(timer);
  }, [failed]);

  // fetch a new token shortly before this one runs out (the server gives a fresh one on every check)
  const expiresAt = run?.realtimeTokenExpiresAt;
  useEffect(() => {
    if (!expiresAt) return;
    const wait = Date.parse(expiresAt) - TOKEN_REFRESH_LEAD_MS - Date.now();
    const timer = setTimeout(check, Math.min(Math.max(wait, 0), MAX_TIMER_MS));
    return () => clearTimeout(timer);
  }, [expiresAt, check]);

  const saved = useMemo(() => partialOf(partial), [partial]);
  const folded = useMemo(() => foldChunks(chunks), [chunks]);
  const thinkingMs = metadata?.thinkingDurationMs;
  const blocks = useMemo(() => {
    // Whichever is further along: the live stream, or what the server has saved (after a reconnect the
    // stream may still be catching up).
    const chosen = live && progress(folded) >= progress(saved) ? folded : saved;
    // there is no "thinking ended" chunk: how long it took comes from the run's metadata
    // (it covers the model's first think, so only the first thinking block gets it)
    const first = chosen.findIndex((block) => block.type === "thinking");
    const block = chosen[first];
    if (thinkingMs === undefined || block?.type !== "thinking" || block.durationMs !== undefined) return chosen;
    return chosen.map((b, i) => (i === first ? { ...block, durationMs: thinkingMs } : b));
  }, [live, folded, saved, thinkingMs]);

  if (!run) return null;
  const phase: StreamPhase =
    stopping || metadata?.status === "stopping" ? "stopping" : blocks.length === 0 || metadata?.status === "thinking" ? "thinking" : "writing";
  return { blocks, phase, live, reconnecting };
}

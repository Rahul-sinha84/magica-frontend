"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, Loader2 } from "lucide-react";
import type { OptimisticMessage } from "@/stores/chatStore";
import type { Message as MessageData } from "@/types";
import { Message } from "./Message";
import type { AgentStream } from "@/hooks/useAgentStream";
import { StreamingMessage } from "./StreamingMessage";

// Within this many pixels of the bottom counts as "at the bottom": new content keeps you there.
export const NEAR_BOTTOM_PX = 80;
// Scrolling this close to the top asks for the next older page.
const NEAR_TOP_PX = 400;
// space above the first message and below the last
const PADDING_START = 40;
const PADDING_END = 16;

type Item = { key: string; kind: "message"; message: MessageData; pending: boolean } | { key: "streaming"; kind: "streaming"; stream: AgentStream };

const asMessage = (p: OptimisticMessage): MessageData => ({
  id: `pending-${p.clientMessageId}`,
  chatId: p.chatId,
  role: "USER",
  content: p.content,
  contentBlocks: [],
  status: "COMPLETED",
  createdAt: p.createdAt,
  agentRunId: null,
  clientMessageId: p.clientMessageId,
});

interface Props {
  messages: MessageData[];
  // messages we've sent that the server hasn't confirmed yet
  pending: OptimisticMessage[];
  // the reply being written, if any
  stream: AgentStream | null;
  hasOlder: boolean;
  isLoadingOlder: boolean;
  onLoadOlder: () => void;
}

// The conversation. Only the rows on screen exist in the page, however long it is.
export function MessageList({ messages, pending, stream, hasOlder, isLoadingOlder, onLoadOlder }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  // the row at the top of the screen when older messages were requested, so it can stay put
  const anchor = useRef<{ key: string; offset: number } | null>(null);
  const [showJump, setShowJump] = useState(false);
  // magica, after a send: the question just sent goes to the top of the view and the reply grows below it,
  // without the view following. Room is added under the last turn so it fills at least a screen, which
  // lets the question reach the top and keeps the view still when the reply lands.
  const [pinned, setPinned] = useState<string | null>(null);
  const scrolledTo = useRef<string | null>(null);
  const sent = pending.at(-1)?.clientMessageId;
  if (sent && sent !== pinned) setPinned(sent);

  const items = useMemo<Item[]>(
    () => [
      // a message we sent keeps the same key from pending to confirmed, so the row isn't rebuilt or re-measured
      ...messages
        .filter((m) => m.role === "USER" || m.role === "ASSISTANT")
        .map((message) => ({ key: message.clientMessageId ?? message.id, kind: "message" as const, message, pending: false })),
      ...pending.map((p) => ({ key: p.clientMessageId, kind: "message" as const, message: asMessage(p), pending: true })),
      ...(stream ? [{ key: "streaming" as const, kind: "streaming" as const, stream }] : []),
    ],
    [messages, pending, stream],
  );

  // the newest reply keeps its footer in view (magica); none while another reply is being written
  const lastItem = items.at(-1);
  const latestReplyKey = lastItem?.kind === "message" && lastItem.message.role === "ASSISTANT" ? lastItem.key : null;

  // the list reads the virtualizer fresh on every render, so the compiler skipping it is fine
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 120,
    overscan: 6,
    paddingStart: PADDING_START,
    paddingEnd: PADDING_END,
    getItemKey: (index) => items[index].key,
  });
  const totalSize = virtualizer.getTotalSize();
  // The room under the last turn, worked out from the same measurements as the rows (so the content never
  // gets shorter for a moment, which would make the browser move the view). The first message has nothing
  // above it to scroll away, so it stays where it is.
  const viewHeight = virtualizer.scrollRect?.height ?? 0;
  const pinnedIndex = pinned ? items.findIndex((item) => item.key === pinned) : -1;
  const pinnedRow = pinnedIndex >= 0 ? virtualizer.measurementsCache[pinnedIndex] : undefined;
  const lastRow = virtualizer.measurementsCache[items.length - 1];
  const pinTop = !pinnedRow || pinnedIndex === 0 ? 0 : pinnedRow.start;
  const filler = pinnedRow && lastRow ? Math.max(0, Math.floor(viewHeight - (lastRow.end - pinTop) - PADDING_END)) : 0;
  const contentHeight = totalSize + filler;

  function loadOlder() {
    const el = scrollRef.current;
    const first = virtualizer.getVirtualItems()[0];
    if (!el || !first || anchor.current) return;
    anchor.current = { key: items[first.index].key, offset: first.start - el.scrollTop };
    onLoadOlder();
  }

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottom.current = fromBottom <= NEAR_BOTTOM_PX;
    setShowJump(fromBottom > NEAR_BOTTOM_PX);
    if (hasOlder && !isLoadingOlder && el.scrollTop < NEAR_TOP_PX) loadOlder();
  }

  // Older messages arrived above: put the row that was at the top back where it was.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const held = anchor.current;
    if (!el || !held || isLoadingOlder) return;
    const index = items.findIndex((item) => item.key === held.key);
    const top = index >= 0 ? virtualizer.getOffsetForIndex(index, "start")?.[0] : undefined;
    if (top !== undefined) el.scrollTop = top - held.offset;
    anchor.current = null;
  });

  // A message just sent goes to the top of the view, wherever you had scrolled to (once, when it's sent).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !pinned || pinnedIndex < 0 || scrolledTo.current === pinned) return;
    scrolledTo.current = pinned;
    el.scrollTop = pinTop;
  }, [pinned, pinnedIndex, pinTop]);

  // At the bottom, stay there as things arrive or grow (a reply, a picture finishing loading), except
  // under a question just sent, where the reply grows without the view following it.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || anchor.current) return;
    if (stickToBottom.current && pinnedIndex < 0) el.scrollTop = el.scrollHeight;
    // the reply grew past the bottom of the view without a scroll: offer the jump down
    else setShowJump(el.scrollHeight - el.scrollTop - el.clientHeight > NEAR_BOTTOM_PX);
  }, [contentHeight, items, pinnedIndex]);

  // A short conversation that doesn't fill the screen has nothing to scroll, so fetch until it does.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && hasOlder && !isLoadingOlder && !anchor.current && el.scrollHeight <= el.clientHeight + NEAR_TOP_PX) loadOlder();
  });

  function jumpToBottom() {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = true;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Conversation"
        tabIndex={0}
        className="size-full overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <div className="relative w-full" style={{ height: contentHeight }}>
          {virtualizer.getVirtualItems().map((row) => {
            const item = items[row.index];
            return (
              <div
                key={row.key}
                ref={virtualizer.measureElement}
                data-index={row.index}
                className="absolute left-0 top-0 w-full"
                style={{ transform: `translateY(${row.start}px)` }}
              >
                <div className="mx-auto w-full max-w-[900px] px-2 pb-6 sm:px-4">
                  {item.kind === "streaming" ? (
                    <StreamingMessage stream={item.stream} />
                  ) : (
                    <Message message={item.message} pending={item.pending} latest={item.key === latestReplyKey} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {isLoadingOlder && (
        <div role="status" className="pointer-events-none absolute left-1/2 top-2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-surface-main px-3 py-1 text-xs text-text-secondary shadow-sm">
          <Loader2 className="size-3 animate-spin" aria-hidden="true" />
          Loading earlier messages
        </div>
      )}

      {showJump && (
        <button
          type="button"
          aria-label="Scroll to bottom"
          onClick={jumpToBottom}
          className="absolute bottom-3 left-1/2 flex size-8 -translate-x-1/2 items-center justify-center rounded-full bg-surface-main shadow-sm outline-none transition-colors hover:bg-surface-secondary focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowDown className="size-4 text-text-secondary" />
        </button>
      )}
    </div>
  );
}

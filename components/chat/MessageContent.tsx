"use client";

import { useState } from "react";
import { ChevronRight, ImageOff, Maximize2 } from "lucide-react";
import { groupBlocks, type Segment } from "@/lib/blocks";
import { assetRatio, cn, formatClipLength, formatDuration, safeAssetUrl } from "@/lib/utils";
import { useChatStore } from "@/stores/chatStore";
import type { AudioBlock, ContentBlock, ImageBlock, VideoBlock } from "@/types";
import { Markdown } from "./Markdown";
import { StepGroup } from "./StepGroup";

type Block = Extract<Segment, { kind: "block" }>["block"];

function Thinking({ block, active }: { block: Extract<ContentBlock, { type: "thinking" }>; active: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="group flex items-center gap-1 rounded-md text-sm font-medium text-text-secondary outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {block.durationMs ? `Thought for ${formatDuration(block.durationMs)}` : <span className={active ? "thinking-shimmer" : undefined}>Thinking</span>}
        <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} aria-hidden="true" />
      </button>
      {open && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-text-secondary">{block.content}</p>}
    </div>
  );
}

// Pictures keep their shape while loading (the list measures rows, so a late image must not shove
// everything below it), and a broken one says so instead of showing the browser's broken-image icon.
// Where a picture or video sits, so the preview can say which task it belongs to and when it was made.
interface Origin {
  chatId?: string;
  createdAt?: string | null;
}

function Picture({ block, origin }: { block: ImageBlock; origin: Origin }) {
  const open = useChatStore((s) => s.openArtifactPanel);
  const src = safeAssetUrl(block.url);
  const [broken, setBroken] = useState(false);
  const ratio = assetRatio(block.width, block.height, 1);
  const label = block.altText ?? "Generated image";

  return (
    <div className="max-h-[512px] w-full max-w-[384px] overflow-hidden rounded-xl bg-surface-primary" style={{ aspectRatio: ratio }}>
      {broken || !src ? (
        <div className="flex size-full flex-col items-center justify-center gap-2 text-sm text-text-secondary">
          <ImageOff className="size-6" aria-hidden="true" />
          Image unavailable
        </div>
      ) : (
        <button
          type="button"
          aria-label={`Open ${label}`}
          disabled={!origin.chatId}
          onClick={() => origin.chatId && open({ chatId: origin.chatId, asset: block, createdAt: origin.createdAt ?? null, openedBy: "user" })}
          className="block size-full cursor-zoom-in outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- generated pictures come from anywhere */}
          <img src={src} alt={label} loading="lazy" onError={() => setBroken(true)} className="size-full object-contain" />
        </button>
      )}
    </div>
  );
}

function Clip({ block, origin }: { block: VideoBlock; origin: Origin }) {
  const open = useChatStore((s) => s.openArtifactPanel);
  const src = safeAssetUrl(block.url);
  const ratio = assetRatio(block.width, block.height, 16 / 9);
  const label = block.altText ?? "Generated video";
  if (!src) {
    return (
      <div className="flex w-full max-w-[384px] items-center justify-center rounded-xl bg-surface-primary text-sm text-text-secondary" style={{ aspectRatio: ratio }}>
        Video unavailable
      </div>
    );
  }
  return (
    <div className="group/clip relative w-full max-w-[384px]">
      <video src={src} controls preload="metadata" aria-label={label} className="w-full rounded-xl bg-surface-primary" style={{ aspectRatio: ratio }} />
      {origin.chatId && (
        // the video's own controls take clicks, so the preview opens from a button in the corner
        <button
          type="button"
          aria-label={`Open ${label}`}
          onClick={() => open({ chatId: origin.chatId!, asset: block, createdAt: origin.createdAt ?? null, openedBy: "user" })}
          className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-md bg-black/50 text-white opacity-0 outline-none transition-opacity focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/clip:opacity-100 [@media(hover:none)]:opacity-100"
        >
          <Maximize2 className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

// Generated audio plays in place, with the browser's own controls. Unlike pictures and video it never opens
// the side panel.
function Sound({ block }: { block: AudioBlock }) {
  const src = safeAssetUrl(block.url);
  const label = block.altText ?? "Generated audio";
  const length = block.durationMs ? formatClipLength(block.durationMs) : "";
  if (!src) {
    return <p className="text-sm text-text-secondary">Audio unavailable</p>;
  }
  return (
    <figure className="w-full max-w-[384px]">
      <audio src={src} controls preload="metadata" aria-label={label} className="w-full" />
      {(block.altText || length) && (
        <figcaption className="mt-1 flex gap-2 text-xs text-text-secondary">
          {block.altText && <span className="min-w-0 truncate">{block.altText}</span>}
          {length && <span className="shrink-0 tabular-nums">{length}</span>}
        </figcaption>
      )}
    </figure>
  );
}

// Only web links are followed; a source with some other kind of address is shown as plain text.
function Source({ url, title }: { url: string; title?: string | null }) {
  let parsed: URL | null = null;
  try {
    parsed = new URL(url);
  } catch {}
  const web = parsed?.protocol === "https:" || parsed?.protocol === "http:";
  const label = title ?? (web ? parsed!.hostname : url);
  const style = "inline-block max-w-full truncate rounded-lg border border-line-tertiary px-3 py-1.5 text-sm text-text-primary";
  return web ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className={cn(style, "hover:bg-surface-secondary")}>
      {label}
    </a>
  ) : (
    <span className={style}>{label}</span>
  );
}

function BlockView({ block, thinkingActive, origin }: { block: Block; thinkingActive: boolean; origin: Origin }) {
  switch (block.type) {
    case "text":
      return <Markdown>{block.content}</Markdown>;
    case "reasoning":
      return (
        <div className="text-text-secondary">
          <Markdown>{block.content}</Markdown>
        </div>
      );
    case "thinking":
      return <Thinking block={block} active={thinkingActive} />;
    case "image":
      return <Picture block={block} origin={origin} />;
    case "video":
      return <Clip block={block} origin={origin} />;
    case "audio":
      return <Sound block={block} />;
    case "citation":
      return <Source url={block.url} title={block.title} />;
    case "usage":
      return null; // shown as the credits line under the reply
  }
}

// Everything in an assistant reply, top to bottom: text, steps, pictures, sources.
export function MessageContent({
  blocks,
  thinkingActive = false,
  chatId,
  createdAt,
}: { blocks: readonly ContentBlock[]; thinkingActive?: boolean } & Origin) {
  const origin = { chatId, createdAt };
  const segments = groupBlocks(blocks).filter((segment) => segment.kind === "steps" || segment.block.type !== "usage");
  return (
    <div>
      {segments.map((segment, i) => {
        // as on magica: a "Completed N steps" or "Thought for" row sits 4px above what follows it, and
        // everything else is 16px apart
        const previous = segments[i - 1];
        const header = previous && (previous.kind === "steps" || previous.block.type === "thinking");
        const gap = i === 0 ? undefined : header ? "mt-1" : "mt-4";
        return segment.kind === "steps" ? (
          <div key={`steps-${segment.calls[0].toolCallId}`} className={gap}>
            <StepGroup calls={segment.calls} results={segment.results} />
          </div>
        ) : (
          <div key={i} className={gap}>
            <BlockView block={segment.block} thinkingActive={thinkingActive} origin={origin} />
          </div>
        );
      })}
    </div>
  );
}

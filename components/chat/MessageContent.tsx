"use client";

import { useState } from "react";
import { ChevronRight, ImageOff } from "lucide-react";
import { groupBlocks, type Segment } from "@/lib/blocks";
import { cn, formatDuration } from "@/lib/utils";
import { useChatStore } from "@/stores/chatStore";
import type { ContentBlock, ImageBlock, VideoBlock } from "@/types";
import { Markdown } from "./Markdown";
import { StepGroup } from "./StepGroup";

type Block = Extract<Segment, { kind: "block" }>["block"];

function Thinking({ block }: { block: Extract<ContentBlock, { type: "thinking" }> }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="group flex items-center gap-1 rounded-md text-sm font-medium text-text-secondary outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {block.durationMs ? `Thought for ${formatDuration(block.durationMs)}` : "Thinking"}
        <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} aria-hidden="true" />
      </button>
      {open && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-text-secondary">{block.content}</p>}
    </div>
  );
}

// Pictures keep their shape while loading (the list measures rows, so a late image must not shove
// everything below it), and a broken one says so instead of showing the browser's broken-image icon.
function Picture({ block }: { block: ImageBlock }) {
  const open = useChatStore((s) => s.openArtifactPanel);
  const [broken, setBroken] = useState(false);
  const ratio = block.width && block.height ? block.width / block.height : 1;
  const label = block.altText ?? "Generated image";

  return (
    <div className="w-full max-w-[384px] overflow-hidden rounded-xl bg-surface-primary" style={{ aspectRatio: ratio }}>
      {broken ? (
        <div className="flex size-full flex-col items-center justify-center gap-2 text-sm text-text-secondary">
          <ImageOff className="size-6" aria-hidden="true" />
          Image unavailable
        </div>
      ) : (
        <button type="button" aria-label={`Open ${label}`} onClick={() => open(block.url, "image", block.altText)} className="block size-full cursor-zoom-in outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {/* eslint-disable-next-line @next/next/no-img-element -- generated pictures come from anywhere */}
          <img src={block.url} alt={label} loading="lazy" onError={() => setBroken(true)} className="size-full object-cover" />
        </button>
      )}
    </div>
  );
}

function Clip({ block }: { block: VideoBlock }) {
  const ratio = block.width && block.height ? block.width / block.height : 16 / 9;
  return (
    <video src={block.url} controls preload="metadata" aria-label={block.altText ?? "Generated video"} className="w-full max-w-[384px] rounded-xl bg-surface-primary" style={{ aspectRatio: ratio }} />
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

function BlockView({ block }: { block: Block }) {
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
      return <Thinking block={block} />;
    case "image":
      return <Picture block={block} />;
    case "video":
      return <Clip block={block} />;
    case "citation":
      return <Source url={block.url} title={block.title} />;
    case "usage":
      return null; // shown as the credits line under the reply
  }
}

// Everything in an assistant reply, top to bottom: text, steps, pictures, sources.
export function MessageContent({ blocks }: { blocks: readonly ContentBlock[] }) {
  const segments = groupBlocks(blocks).filter((segment) => segment.kind === "steps" || segment.block.type !== "usage");
  return (
    <div className="space-y-4">
      {segments.map((segment, i) =>
        segment.kind === "steps" ? <StepGroup key={`steps-${segment.calls[0].toolCallId}`} calls={segment.calls} results={segment.results} /> : <BlockView key={i} block={segment.block} />,
      )}
    </div>
  );
}

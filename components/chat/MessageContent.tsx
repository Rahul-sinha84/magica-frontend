"use client";

import { useCallback, useMemo, useState } from "react";
import { Download, ImageOff, ImagePlus, Maximize2 } from "lucide-react";
import { groupBlocks, type Segment } from "@/lib/blocks";
import { assetRatio, cn, formatClipLength, safeAssetUrl } from "@/lib/utils";
import { useChatStore } from "@/stores/chatStore";
import type { AudioBlock, ContentBlock, ImageBlock, VideoBlock } from "@/types";
import { Markdown, type PictureFor } from "./Markdown";
import { StepGroup } from "./StepGroup";

type Block = Extract<Segment, { kind: "block" }>["block"];


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
  // as on magica: a box that fits the picture's shape inside 384 x 384. On a narrow screen it gets narrower
  // but keeps its height, and the picture sits inside it.
  const ratio = assetRatio(block.width, block.height, 1);
  const box = ratio >= 1 ? { width: 384, height: Math.round(384 / ratio) } : { width: Math.round(384 * ratio), height: 384 };
  const label = block.altText ?? "Generated image";
  const overlayButton =
    "flex size-7 items-center justify-center rounded-[4px] bg-[rgba(10,10,11,0.5)] text-white outline-none hover:bg-[rgba(10,10,11,0.7)] focus-visible:ring-2 focus-visible:ring-white";

  return (
    <div className="group/picture relative max-w-full overflow-hidden rounded-xl bg-surface-primary" style={box}>
      {broken || !src ? (
        <div className="flex size-full flex-col items-center justify-center gap-2 text-sm text-text-secondary">
          <ImageOff className="size-6" aria-hidden="true" />
          Image unavailable
        </div>
      ) : (
        <>
          <button
            type="button"
            aria-label={`Open ${label}`}
            disabled={!origin.chatId}
            onClick={() => origin.chatId && open({ chatId: origin.chatId, asset: block, createdAt: origin.createdAt ?? null, openedBy: "user" })}
            className="block size-full cursor-zoom-in outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- generated pictures come from anywhere */}
            <img src={src} alt={label} loading="lazy" onError={() => setBroken(true)} className="size-full rounded-xl object-contain" />
          </button>
          {/* magica's two corner actions, shown on hover or keyboard focus (always on touch screens) */}
          <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover/picture:opacity-100 [@media(hover:none)]:opacity-100">
            <button type="button" aria-label="Use as reference" title="Not available in this build" aria-disabled="true" className={overlayButton}>
              <ImagePlus className="size-4" aria-hidden="true" />
            </button>
            <a href={src} download target="_blank" rel="noopener noreferrer" aria-label={`Download ${label}`} className={overlayButton}>
              <Download className="size-4" aria-hidden="true" />
            </a>
          </div>
        </>
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

function BlockView({ block, origin, pictureFor }: { block: Block; origin: Origin; pictureFor?: PictureFor }) {
  switch (block.type) {
    case "text":
      return <Markdown pictureFor={pictureFor}>{block.content}</Markdown>;
    case "reasoning":
      return (
        <div className="text-text-secondary">
          <Markdown>{block.content}</Markdown>
        </div>
      );
    case "thinking":
      return null; // magica shows thinking only live, as the "Thinking" row; never in a reply
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

const isMedia = (segment: Segment) => segment.kind === "block" && (segment.block.type === "image" || segment.block.type === "video" || segment.block.type === "audio");

// a markdown image in the text: ![alt](address) or ![alt](<address> "title")
const MARKDOWN_IMAGE = /!\[[^\]]*\]\(\s*<?([^\s)>]+)>?(?:\s+["'][^"']*["'])?\s*\)/g;

// The reply's own pictures that its text also shows, by address. Only these are drawn from the text; any
// other image address there stays a link.
function picturesInText(blocks: readonly ContentBlock[]) {
  const pictures = new Map(blocks.flatMap((block) => (block.type === "image" ? [[block.url, block] as const] : [])));
  const found = new Map<string, ImageBlock>();
  for (const block of blocks) {
    if (block.type !== "text") continue;
    for (const [, url] of block.content.matchAll(MARKDOWN_IMAGE)) {
      const picture = pictures.get(url);
      if (picture) found.set(url, picture);
    }
  }
  return found;
}

// Everything in an assistant reply, laid out as magica does: the "Thinking" row, the steps, the text (and
// anything else written), then the pictures, videos and audio the reply made, in one media area at the end.
// A tool's picture arrives before the model writes about it, so it is moved below the text rather than
// shown in the order it was streamed.
export function MessageContent({
  blocks,
  chatId,
  createdAt,
}: { blocks: readonly ContentBlock[] } & Origin) {
  const origin = useMemo(() => ({ chatId, createdAt }), [chatId, createdAt]);
  // Not shown: usage (it only feeds the credits line), thinking (magica shows it only live, as the
  // "Thinking" row), and blank text (a reply whose answer is the image its tools made).
  const segments = groupBlocks(blocks).filter(
    (segment) =>
      segment.kind === "steps" ||
      (segment.block.type !== "usage" &&
        segment.block.type !== "thinking" &&
        !((segment.block.type === "text" || segment.block.type === "reasoning") && !segment.block.content.trim())),
  );
  // pictures this reply made that the model also put in its text (as markdown) show there, not again below
  const inText = useMemo(() => picturesInText(blocks), [blocks]);
  const pictureFor = useCallback<PictureFor>((src) => {
    const block = inText.get(src);
    return block ? <Picture block={block} origin={origin} /> : null;
  }, [inText, origin]);
  const flow = segments.filter((segment) => !isMedia(segment));
  const media = segments.flatMap((segment) =>
    segment.kind === "block" && (segment.block.type === "image" || segment.block.type === "video" || segment.block.type === "audio") && !inText.has(segment.block.url)
      ? [segment.block]
      : [],
  );
  const visual = media.filter((block): block is ImageBlock | VideoBlock => block.type !== "audio");
  const sounds = media.filter((block): block is AudioBlock => block.type === "audio");

  // as on magica: a "Completed N steps" or "Thought for" row sits 4px above what follows it, and
  // everything else is 16px apart
  const gapAfter = (previous: Segment | undefined) =>
    !previous ? undefined : previous.kind === "steps" || previous.block.type === "thinking" ? "mt-1" : "mt-4";
  const last = flow.at(-1);

  return (
    <div>
      {flow.map((segment, i) =>
        segment.kind === "steps" ? (
          <div key={`steps-${segment.calls[0].toolCallId}`} className={gapAfter(flow[i - 1])}>
            <StepGroup calls={segment.calls} results={segment.results} />
          </div>
        ) : (
          <div key={i} className={gapAfter(flow[i - 1])}>
            <BlockView block={segment.block} origin={origin} pictureFor={pictureFor} />
          </div>
        ),
      )}
      {visual.length > 0 && (
        <div className={cn("flex flex-wrap gap-2", gapAfter(last))}>
          {visual.map((block) => (
            <div key={block.url} className={block.type === "video" ? "w-full max-w-[384px]" : "max-w-full"}>
              <BlockView block={block} origin={origin} />
            </div>
          ))}
        </div>
      )}
      {sounds.map((block, i) => (
        <div key={block.url} className={i === 0 && visual.length === 0 ? gapAfter(last) : "mt-4"}>
          <BlockView block={block} origin={origin} />
        </div>
      ))}
    </div>
  );
}

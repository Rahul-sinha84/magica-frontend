"use client";

import { AlertCircle, Film, Loader2, Music, RotateCw, TimerOff, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Attachment } from "@/stores/attachmentsStore";

interface Props {
  items: Attachment[];
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  // a ready picture opens in the preview, as on magica
  onOpen?: (item: Attachment) => void;
}

// a ring that fills as the file uploads
function ProgressRing({ value }: { value: number }) {
  const r = 11;
  const length = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 28 28" className="size-7 -rotate-90" aria-hidden="true">
      <circle cx="14" cy="14" r={r} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="3" />
      <circle cx="14" cy="14" r={r} fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeDasharray={length} strokeDashoffset={length * (1 - value)} />
    </svg>
  );
}

function Thumb({ item }: { item: Attachment }) {
  if (item.previewUrl && item.kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element -- a local file, or a library picture from anywhere
    return <img src={item.previewUrl} alt="" className="size-full object-cover" />;
  }
  const Icon = item.kind === "video" ? Film : item.kind === "audio" ? Music : AlertCircle;
  return (
    <span className="flex size-full items-center justify-center text-text-secondary">
      <Icon className="size-5" aria-hidden="true" />
    </span>
  );
}

// What a chip says to a screen reader about where its file stands.
function describe(item: Attachment) {
  switch (item.status) {
    case "uploading":
      return `Uploading, ${Math.round(item.progress * 100)}%`;
    case "processing":
      return "Processing";
    case "failed":
      return `Failed: ${item.error ?? "the upload didn't finish"}`;
    case "expired":
      return item.error ?? "This file has expired. Upload it again.";
    default:
      return "Ready";
  }
}

// The files waiting to go with the next message, in order: magica's 60px thumbnails with a × in the corner (which
// also stops an upload). While a file uploads its chip shows how far along it is; a failed or expired one says so.
export function AttachmentChips({ items, onRemove, onRetry, onOpen }: Props) {
  if (items.length === 0) return null;
  return (
    <ul aria-label="Attachments" className="flex flex-wrap gap-2">
      {items.map((item) => {
        const openable = item.status === "ready" && item.kind === "image" && !!onOpen;
        return (
          <li key={item.id} className="group/thumb relative shrink-0" title={item.error ?? item.name}>
            <div className="relative size-[60px] overflow-hidden rounded-[10px] bg-surface-secondary">
              {openable ? (
                <button type="button" aria-label={`Open ${item.name}`} onClick={() => onOpen(item)} className="block size-full cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                  <Thumb item={item} />
                </button>
              ) : (
                <Thumb item={item} />
              )}
              {item.status === "uploading" && (
                <span className="absolute inset-0 flex items-center justify-center bg-[rgba(10,10,11,0.45)]">
                  <ProgressRing value={item.progress} />
                </span>
              )}
              {item.status === "processing" && (
                <span className="absolute inset-0 flex items-center justify-center bg-[rgba(10,10,11,0.45)] text-white">
                  <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                </span>
              )}
              {/* a file the server refused when sending (it had finished uploading): nothing to retry, only remove */}
              {item.status === "failed" && item.asset && (
                <span className="absolute inset-0 flex items-center justify-center bg-[rgba(10,10,11,0.55)] text-white">
                  <AlertCircle className="size-5" aria-hidden="true" />
                </span>
              )}
              {item.status === "failed" && !item.asset && (
                <button
                  type="button"
                  aria-label={`Retry upload: ${item.name}`}
                  onClick={() => onRetry(item.id)}
                  className="absolute inset-0 flex items-center justify-center bg-[rgba(10,10,11,0.55)] text-white outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <RotateCw className="size-5" aria-hidden="true" />
                </button>
              )}
              {item.status === "expired" && (
                <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-[rgba(10,10,11,0.55)] text-[10px] font-medium text-white">
                  <TimerOff className="size-4" aria-hidden="true" />
                  Expired
                </span>
              )}
            </div>
            <span className="sr-only">
              {item.name}: {describe(item)}
            </span>
            <button
              type="button"
              aria-label={`Remove attachment: ${item.name}`}
              onClick={() => onRemove(item.id)}
              className={cn(
                "absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-[rgba(10,10,11,0.5)] text-white shadow-sm outline-none hover:bg-[rgba(10,10,11,0.7)] focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

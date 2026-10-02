"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog as DialogPrimitive } from "radix-ui";
import { format, isToday, isYesterday } from "date-fns";
import {
  ArrowDownUp,
  ChevronDown,
  CloudUpload,
  Download,
  FileText,
  Film,
  Folder,
  Heart,
  LayoutGrid,
  Link2,
  Music,
  RefreshCw,
  Rows3,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AttachmentChips } from "@/components/composer/AttachmentChips";
import { Button } from "@/components/ui/button";
import { useAttachments } from "@/hooks/useAttachments";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { mediaQueryKey, useMediaLibrary, type MediaTab } from "@/hooks/useMediaLibrary";
import { UPLOAD_ACCEPT, typeLabel } from "@/lib/uploadFiles";
import { cn, safeAssetUrl } from "@/lib/utils";
import { useUiStore } from "@/stores/uiStore";
import type { MediaAsset } from "@/types";

const INERT = "Not available in this build";
// uploads made from the library land in the library; they aren't attached to a message
export const LIBRARY_UPLOADS = "media-library";
// load the next page this close to the end of the grid
const NEAR_END_PX = 240;

const TABS: { tab: MediaTab; label: string; title: string; Icon: typeof LayoutGrid }[] = [
  { tab: "all", label: "All", title: "Show all assets", Icon: LayoutGrid },
  { tab: "generated", label: "Generated", title: "AI-generated content from your chats and playground", Icon: Sparkles },
  { tab: "upload", label: "My Uploads", title: "Files you uploaded directly", Icon: CloudUpload },
];

const pill = "flex h-8 items-center gap-[7px] rounded-full border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const outlined =
  "flex h-9 items-center gap-[7px] rounded-full border border-[#e5e5e5] bg-surface-main px-3.5 text-sm font-medium text-[#5e5e5e] outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-line-tertiary dark:text-text-secondary";
const round = "flex size-7 shrink-0 items-center justify-center rounded-full text-[#5e5e5e] outline-none hover:bg-surface-secondary focus-visible:ring-2 focus-visible:ring-ring dark:text-text-secondary";

// what a tile is called: the file's name, or for generated media the prompt (or the model)
export const assetLabel = (asset: MediaAsset) => asset.name ?? asset.prompt ?? asset.model ?? "Generated media";
const kindWord = { image: "Image", video: "Video", audio: "Audio" } as const;

// "Today", "Yesterday", then the date
function dayOf(iso: string) {
  const date = new Date(iso);
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "MMM d, yyyy");
}

function byDay(media: MediaAsset[]) {
  const groups: { day: string; items: MediaAsset[] }[] = [];
  for (const asset of media) {
    const day = dayOf(asset.createdAt);
    const last = groups.at(-1);
    if (last?.day === day) last.items.push(asset);
    else groups.push({ day, items: [asset] });
  }
  return groups;
}

// magica counts with two digits: "08 Items"
const itemCount = (n: number) => `${String(n).padStart(2, "0")} ${n === 1 ? "Item" : "Items"}`;

function Tile({ asset, onPick }: { asset: MediaAsset; onPick: (asset: MediaAsset) => void }) {
  const label = assetLabel(asset);
  // PNG, MP4…: none when the file's type isn't known
  const kind = typeLabel(asset.mimeType, asset.name, asset.url);
  const url = safeAssetUrl(asset.url);
  const [copied, setCopied] = useState(false);
  const action =
    "pointer-events-auto flex size-7 items-center justify-center rounded-full bg-[rgba(10,10,11,0.5)] text-white outline-none hover:bg-[rgba(10,10,11,0.7)] focus-visible:ring-2 focus-visible:ring-white";

  return (
    <li className="group/tile relative aspect-[264/177] overflow-hidden rounded-[10px] bg-surface-secondary">
      <button
        type="button"
        aria-label={`${kindWord[asset.type]}: ${label}`}
        onClick={() => onPick(asset)}
        className="absolute inset-0 size-full outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {asset.type === "image" && url ? (
          // eslint-disable-next-line @next/next/no-img-element -- library files come from anywhere
          <img src={url} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center text-text-secondary">
            {asset.type === "video" ? <Film className="size-8" aria-hidden="true" /> : <Music className="size-8" aria-hidden="true" />}
          </span>
        )}
      </button>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[45px] bg-gradient-to-t from-[rgba(10,10,11,0.7)] via-[rgba(10,10,11,0.5)] to-transparent" />
      <div className="pointer-events-none absolute bottom-1.5 left-2 right-2 flex items-center gap-1 text-xs text-white">
        {kind && <span className="shrink-0 rounded px-1 py-0.5">{kind}</span>}
        <p className="min-w-0 truncate">{label}</p>
      </div>
      {/* magica's actions on hover */}
      <div className="pointer-events-none absolute right-2 top-2 flex gap-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover/tile:opacity-100 [@media(hover:none)]:opacity-100">
        <button
          type="button"
          aria-label={copied ? "Link copied" : "Copy link"}
          disabled={!url}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(new URL(url!, window.location.href).href);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              toast.error("Couldn't copy to the clipboard");
            }
          }}
          className={action}
        >
          <Link2 className="size-3.5" aria-hidden="true" />
        </button>
        {url && (
          <a href={url} download target="_blank" rel="noopener noreferrer" aria-label="Download" className={action}>
            <Download className="size-3.5" aria-hidden="true" />
          </a>
        )}
        <button type="button" aria-label="Favorite" title={INERT} aria-disabled="true" className={action}>
          <Heart className="size-3.5" aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

function SkeletonTiles({ count }: { count: number }) {
  return (
    <ul aria-hidden="true" className="grid grid-cols-2 gap-2 md:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} data-testid="media-skeleton" className="aspect-[264/177] animate-pulse rounded-[10px] bg-surface-secondary" />
      ))}
    </ul>
  );
}

function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-3 py-16 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-surface-secondary text-text-primary" aria-hidden="true">
        {icon}
      </div>
      <p className="text-sm font-medium text-text-primary">{title}</p>
      <p className="-mt-2 text-xs text-text-secondary">{text}</p>
      {action}
    </div>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // a file was chosen: it is attached, and the library closes
  onPick: (asset: MediaAsset) => void;
  // where focus goes when it closes (it opens from a menu that is gone by then)
  returnFocusTo?: RefObject<HTMLElement | null>;
}

function LibraryBody({ onPick }: { onPick: (asset: MediaAsset) => void }) {
  const [tab, setTab] = useState<MediaTab>("all");
  const [text, setText] = useState("");
  const library = useMediaLibrary(tab, text);
  const uploads = useAttachments(LIBRARY_UPLOADS);
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // the count stays put while another tab or search loads
  const [lastTotal, setLastTotal] = useState<number | null>(null);
  if (library.total !== undefined && library.total !== lastTotal) setLastTotal(library.total);

  // an upload made here is in the library once it is ready: show it there, and drop its chip
  const { items: uploading, remove: dropUpload } = uploads;
  useEffect(() => {
    const done = uploading.filter((item) => item.status === "ready");
    if (done.length === 0) return;
    done.forEach((item) => dropUpload(item.id));
    void queryClient.invalidateQueries({ queryKey: mediaQueryKey });
  }, [uploading, dropUpload, queryClient]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el || !library.hasNextPage || library.isFetchingNextPage || library.isFetchNextPageError) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_END_PX) void library.fetchNextPage();
  }

  const upload = () => fileRef.current?.click();
  const searching = library.q !== "";

  let body: ReactNode;
  if (library.isPending) {
    body = <SkeletonTiles count={6} />;
  } else if (!library.media) {
    body = (
      <div className="flex flex-col items-center gap-2 px-4 py-16 text-center text-sm text-text-secondary">
        <p role="alert">Couldn&apos;t load your media.</p>
        <Button variant="outline" size="sm" onClick={() => void library.refetch()}>
          Try again
        </Button>
      </div>
    );
  } else if (library.media.length === 0) {
    body = searching ? (
      <Empty
        icon={<FileText className="size-8" />}
        title="No assets found"
        text={`No results match "${library.q}". Try a different filename, prompt, or clear the search.`}
        action={
          <button type="button" onClick={() => setText("")} className={cn(outlined, "mt-1 text-text-primary")}>
            <X className="size-3.5" aria-hidden="true" />
            Clear search
          </button>
        }
      />
    ) : tab === "generated" ? (
      <Empty icon={<FileText className="size-8" />} title="No generated assets yet" text="Images and videos the agent makes in your chats show up here" />
    ) : (
      <Empty
        icon={<FileText className="size-8" />}
        title={tab === "upload" ? "No uploaded assets yet" : "No assets yet"}
        text="Upload files using the Upload button or drag & drop"
        action={
          <button type="button" onClick={upload} className={cn(outlined, "mt-1 text-text-primary")}>
            <CloudUpload className="size-3.5" aria-hidden="true" />
            Upload files
          </button>
        }
      />
    );
  } else {
    body = (
      <>
        {byDay(library.media).map((group) => (
          <section key={group.day} aria-label={group.day} className="mb-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm text-text-primary">{group.day}</h3>
                <span className="text-sm text-[#5e5e5e] dark:text-text-secondary">{itemCount(group.items.length)}</span>
              </div>
              <button
                type="button"
                aria-label={`Select all items from ${group.day}`}
                title={INERT}
                aria-disabled="true"
                className="mt-2.5 size-5 rounded border-2 border-[#8a8a8a] outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <ul className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
              {group.items.map((asset) => (
                <Tile key={asset.id} asset={asset} onPick={onPick} />
              ))}
            </ul>
          </section>
        ))}
        {library.isFetchingNextPage && <SkeletonTiles count={3} />}
        {library.isFetchNextPageError && (
          <div className="flex flex-col items-center gap-2 py-4 text-sm text-text-secondary">
            <p role="alert">Couldn&apos;t load more of your media.</p>
            <Button variant="outline" size="sm" onClick={() => void library.fetchNextPage()}>
              Try again
            </Button>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        multiple
        accept={UPLOAD_ACCEPT}
        aria-label="Upload files to media library"
        tabIndex={-1}
        className="sr-only"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          uploads.addFiles(files);
        }}
      />
      <div className="m-4 mb-5 flex shrink-0 flex-col gap-3 p-4 pb-0 md:pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <DialogPrimitive.Title className="text-sm font-semibold leading-[18px] text-text-primary">Media Library</DialogPrimitive.Title>
            <p className="text-xs text-text-secondary">{lastTotal === null ? " " : `${lastTotal} ${lastTotal === 1 ? "file" : "files"}`}</p>
          </div>
          <DialogPrimitive.Close aria-label="Close media library" className={round}>
            <X className="size-3.5" />
          </DialogPrimitive.Close>
        </div>
        <DialogPrimitive.Description className="sr-only">Pick a file to attach, or upload new ones.</DialogPrimitive.Description>
        <div className="flex items-center gap-4">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#919191]" aria-hidden="true" />
            <input
              type="search"
              aria-label="Search assets"
              placeholder="Search prompts & file names…"
              value={text}
              onChange={(event) => setText(event.target.value)}
              className="h-[34px] w-full rounded-full bg-surface-primary px-10 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus-visible:ring-2 focus-visible:ring-[#8a8a8a] focus-visible:ring-offset-2 [&::-webkit-search-cancel-button]:hidden"
            />
            {text && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setText("")}
                className="absolute right-0.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-text-tertiary outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
          <button
            type="button"
            aria-label="Refresh media library"
            onClick={() => void queryClient.invalidateQueries({ queryKey: mediaQueryKey })}
            className={round}
          >
            <RefreshCw className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="Upload files to media library"
            onClick={upload}
            className="flex h-9 shrink-0 items-center gap-[7px] rounded-full bg-gradient-to-b from-[#3b3b3b] to-[#2b2b2b] px-3.5 text-sm font-medium text-[#f7f7f7] shadow-[0_0_0_1px_#303030,inset_0_1px_0_rgba(255,255,255,0.15)] outline-none hover:from-[#454545] focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CloudUpload className="size-3.5" aria-hidden="true" />
            Upload media
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-3 pr-4">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="px-8 pt-4">
            <p className="text-sm font-semibold text-[#181818] dark:text-text-primary">Your Media</p>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-3">
                {TABS.map(({ tab: value, label, title, Icon }) => (
                  <button
                    key={value}
                    type="button"
                    title={title}
                    aria-pressed={tab === value}
                    onClick={() => setTab(value)}
                    className={cn(
                      pill,
                      tab === value
                        ? "border-[#e5e5e5] bg-[#ededed] font-semibold text-[#181818] dark:border-line-tertiary dark:bg-surface-tertiary dark:text-text-primary"
                        : "border-transparent bg-surface-main font-medium text-[#5e5e5e] hover:bg-surface-primary dark:text-text-secondary",
                    )}
                  >
                    <Icon className="size-3.5" aria-hidden="true" />
                    {label}
                  </button>
                ))}
                <button type="button" title={INERT} aria-disabled="true" className={cn(pill, "border-transparent bg-surface-main font-medium text-[#5e5e5e] dark:text-text-secondary")}>
                  <Heart className="size-3.5" aria-hidden="true" />
                  Favorites
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" title={INERT} aria-disabled="true" aria-label="Sort media library by Newest First" className={outlined}>
                  <ArrowDownUp className="size-3.5" aria-hidden="true" />
                  Sort
                  <ChevronDown className="size-3.5" aria-hidden="true" />
                </button>
                <button type="button" title={INERT} aria-disabled="true" className={outlined}>
                  <SlidersHorizontal className="size-3.5" aria-hidden="true" />
                  Filter
                  <ChevronDown className="size-3.5" aria-hidden="true" />
                </button>
                <div className="flex items-center gap-[5px]">
                  <button type="button" aria-label="Grid view" title={INERT} aria-disabled="true" aria-pressed="true" className={cn(round, "size-8 bg-[#ededed] text-[#181818] dark:bg-surface-tertiary dark:text-text-primary")}>
                    <LayoutGrid className="size-3.5" />
                  </button>
                  <button type="button" aria-label="List view" title={INERT} aria-disabled="true" aria-pressed="false" className={cn(round, "size-8")}>
                    <Rows3 className="size-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {uploading.length > 0 && (
            <div className="px-6 pt-4">
              <p className="mb-2 text-xs text-text-secondary">Uploading to your library</p>
              <AttachmentChips items={uploading} onRemove={uploads.remove} onRetry={uploads.retry} />
            </div>
          )}

          <div ref={scrollRef} onScroll={onScroll} className="mt-9 min-h-0 flex-1 overflow-y-auto px-6 pb-6">
            {body}
          </div>
        </div>

        {/* magica's folders: not in this build */}
        <nav aria-label="Folders" className="hidden w-[188px] shrink-0 flex-col gap-0.5 pt-[44px] lg:flex">
          <button type="button" title={INERT} aria-disabled="true" className="flex h-8 items-center gap-2 rounded-lg bg-surface-main px-[9px] text-sm font-medium text-[#181818] dark:text-text-primary">
            <LayoutGrid className="size-3.5" aria-hidden="true" />
            All
          </button>
          <button type="button" title={INERT} aria-disabled="true" className="flex h-8 items-center gap-2 rounded-lg px-[9px] text-sm font-medium text-[#5e5e5e] dark:text-text-secondary">
            <Folder className="size-3.5" aria-hidden="true" />
            My folders
          </button>
        </nav>
      </div>
    </>
  );
}

// magica's Media Library: the user's uploads and generated media, newest first and grouped by day, to pick a file
// from (picking attaches it and closes the library) or to upload new ones to. It sits in the space beside the
// sidebar, with nothing dimmed behind it.
export function MediaLibraryDialog({ open, onOpenChange, onPick, returnFocusTo }: Props) {
  const isDesktop = useIsDesktop();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  // the page beside the sidebar: from its edge (or the screen's on a phone) to 16px short of the right
  const left = isDesktop ? (collapsed ? 64 : 256) : 16;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50" />
        <DialogPrimitive.Content
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            (event.currentTarget as HTMLElement | null)?.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusTo?.current?.focus({ preventScroll: true });
          }}
          style={{ left: `calc(${left}px + (100vw - ${left}px - 16px) / 2)`, width: `min(1060px, calc(100vw - ${left}px - 32px))` }}
          className="fixed bottom-[50px] top-[50px] z-50 flex -translate-x-1/2 flex-col overflow-hidden rounded-2xl bg-surface-main shadow-[0_24px_32px_-8px_rgba(26,26,24,0.12),0_8px_12px_-6px_rgba(26,26,24,0.06)] outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 max-md:bottom-4 max-md:top-4"
        >
          <LibraryBody onPick={onPick} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

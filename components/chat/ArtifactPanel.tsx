"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Box, Calendar, Check, Copy, Download, FileText, Hash, Heart, ImagePlus, Link2, Sparkles, Trash2, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { cn, formatPreviewDate, safeAssetUrl } from "@/lib/utils";
import { useChatStore, type Artifact } from "@/stores/chatStore";

const INERT = "Not available in this build";

// One line of the details column: a small icon chip, the label, and the value on the right.
function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm leading-5">
      <div className="flex shrink-0 items-center gap-1">
        <span className="flex size-6 items-center justify-center rounded-[4px] bg-surface-secondary text-text-secondary" aria-hidden="true">
          {icon}
        </span>
        <span className="text-text-secondary">{label}</span>
      </div>
      {/* long values (a model name) are cut short; the full text is on hover */}
      <span className="ml-auto min-w-0 truncate text-right text-text-primary" title={typeof children === "string" ? children : undefined}>
        {children}
      </span>
    </div>
  );
}

const actionButton =
  "flex h-[42px] items-center justify-center gap-2 rounded-[10px] bg-surface-secondary px-3 text-sm text-text-primary outline-none transition-colors hover:bg-surface-tertiary focus-visible:ring-2 focus-visible:ring-ring";

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy(what: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Couldn't copy to the clipboard");
    }
  }
  return { copied, copy };
}

function Media({ artifact }: { artifact: Artifact }) {
  const { asset } = artifact;
  const src = safeAssetUrl(asset.url);
  const [broken, setBroken] = useState(false);
  const label = asset.altText ?? (asset.type === "video" ? "Generated video" : "Generated image");

  if (!src || broken) {
    return (
      <div className="flex size-full min-h-60 items-center justify-center rounded-xl bg-surface-primary text-sm text-text-secondary">
        {asset.type === "video" ? "Video unavailable" : "Image unavailable"}
      </div>
    );
  }
  if (asset.type === "video") {
    return <video key={src} src={src} controls preload="metadata" aria-label={label} className="max-h-full max-w-full rounded-xl bg-surface-primary" />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- generated pictures come from anywhere
    <img key={src} src={src} alt={label} onError={() => setBroken(true)} className="max-h-full max-w-full rounded-xl object-contain" />
  );
}

function Details({ artifact }: { artifact: Artifact }) {
  const { asset, createdAt } = artifact;
  const { copied, copy } = useCopy();
  const link = safeAssetUrl(asset.url);
  const created = createdAt ? formatPreviewDate(createdAt) : "";

  return (
    <aside className="flex w-full shrink-0 flex-col justify-between gap-6 rounded-xl border border-line-tertiary bg-[#f8f8f8] p-4 md:m-5 md:w-[394px] dark:bg-surface-primary">
      <div className="flex flex-col gap-3">
        {asset.prompt && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 text-sm leading-5">
                <span className="flex size-6 items-center justify-center rounded-[4px] bg-surface-secondary text-text-secondary" aria-hidden="true">
                  <FileText className="size-4" />
                </span>
                <span className="text-text-secondary">Prompt</span>
              </div>
              <button
                type="button"
                aria-label={copied === "prompt" ? "Copied" : "Copy prompt"}
                onClick={() => copy("prompt", asset.prompt!)}
                className="flex items-center gap-2 rounded-md text-sm text-text-secondary outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-ring"
              >
                {copied === "prompt" ? "Copied" : "Copy"}
                {copied === "prompt" ? <Check className="size-5" aria-hidden="true" /> : <Copy className="size-5" aria-hidden="true" />}
              </button>
            </div>
            <p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-[10px] border-[0.5px] border-line-secondary bg-surface-secondary px-2 py-2 text-sm leading-5 text-text-primary">
              {asset.prompt}
            </p>
          </div>
        )}
        {asset.prompt && <div className="h-px bg-line-tertiary" />}
        <div className="flex flex-col gap-4">
          {created && (
            <Row icon={<Calendar className="size-4" />} label="Created on">
              {created}
            </Row>
          )}
          <Row icon={<Sparkles className="size-4" />} label="Source">
            Generated in chat
          </Row>
          {asset.model && (
            <Row icon={<Wand2 className="size-4" />} label="Model">
              {asset.model}
            </Row>
          )}
        </div>
        {asset.width && asset.height ? (
          <>
            <div className="h-px bg-line-tertiary" />
            <Row icon={<Hash className="size-4" />} label="Dimensions">
              {asset.width} X {asset.height}
            </Row>
          </>
        ) : null}
        {asset.type === "video" && asset.mimeType ? (
          <Row icon={<Box className="size-4" />} label="Format">
            {asset.mimeType}
          </Row>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={actionButton} title={INERT} aria-disabled="true">
          <Heart className="size-4" aria-hidden="true" />
          Add to Favorite
        </button>
        <button type="button" className={actionButton} disabled={!link} onClick={() => link && copy("link", new URL(link, window.location.href).href)}>
          {copied === "link" ? <Check className="size-4" aria-hidden="true" /> : <Link2 className="size-4" aria-hidden="true" />}
          {copied === "link" ? "Copied" : "Copy Link"}
        </button>
        {link ? (
          <a href={link} download target="_blank" rel="noopener noreferrer" className={actionButton}>
            <Download className="size-4" aria-hidden="true" />
            Download
          </a>
        ) : (
          <button type="button" className={actionButton} disabled>
            <Download className="size-4" aria-hidden="true" />
            Download
          </button>
        )}
        <button type="button" className={cn(actionButton, "text-destructive")} title={INERT} aria-disabled="true">
          <Trash2 className="size-4" aria-hidden="true" />
          Delete File
        </button>
      </div>
    </aside>
  );
}

// magica's Image (or Video) Preview: a centered dialog over a blurred backdrop, the picture on the left and its
// details on the right. It opens when a picture in the chat is clicked (never by itself), and closes with the
// close button, Escape or a click outside. On a phone the details stack under the picture.
export function ArtifactPanel() {
  const { isOpen, artifact } = useChatStore((s) => s.artifactPanel);
  const close = useChatStore((s) => s.closeArtifactPanel);
  const { chatId } = useParams<{ chatId?: string }>();

  // it belongs to one task: moving to another task (or home) closes it
  useEffect(() => {
    if (isOpen && artifact && artifact.chatId !== chatId) close();
  }, [isOpen, artifact, chatId, close]);

  // The dialog opens from a picture in the chat rather than from a trigger of its own, so it remembers what
  // had focus (before its own focus handling runs) and gives focus back there when it closes.
  const returnFocus = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (isOpen) returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, [isOpen]);

  const title = artifact?.asset.type === "video" ? "Video Preview" : "Image Preview";

  return (
    <DialogPrimitive.Root open={isOpen && !!artifact} onOpenChange={(open) => !open && close()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgba(10,10,11,0.5)] backdrop-blur-[3px] data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true });
          }}
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-[1248px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto rounded-xl border border-line-tertiary bg-surface-main shadow-xl outline-none md:h-[700px] md:flex-row md:overflow-hidden data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
        >
          {artifact && (
            <>
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="flex items-center gap-3 px-5 pt-5 md:px-9 md:pt-9">
                  <DialogPrimitive.Title className="min-w-0 flex-1 truncate text-base font-semibold leading-7 text-text-primary">{title}</DialogPrimitive.Title>
                  <button
                    type="button"
                    aria-label="Use as reference"
                    title={INERT}
                    aria-disabled="true"
                    className="flex size-5 items-center justify-center text-text-secondary outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ImagePlus className="size-5" aria-hidden="true" />
                  </button>
                  <DialogPrimitive.Close
                    aria-label="Close preview"
                    className="flex size-[46px] items-center justify-center rounded-[10px] border border-line-tertiary bg-surface-primary text-text-primary outline-none hover:bg-surface-secondary focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="size-5" />
                  </DialogPrimitive.Close>
                </div>
                <div className="flex min-h-[240px] flex-1 items-center justify-center p-5 md:min-h-0 md:p-10">
                  <Media key={artifact.asset.url} artifact={artifact} />
                </div>
              </div>
              <div className="flex px-5 pb-5 md:p-0">
                <Details artifact={artifact} />
              </div>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

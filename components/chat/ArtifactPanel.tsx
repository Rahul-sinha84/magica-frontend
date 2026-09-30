"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { Calendar, Check, Copy, Download, FileText, Heart, Link2, Ruler, Sparkles, Trash2, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { assetRatio, cn, formatPreviewDate, safeAssetUrl } from "@/lib/utils";
import { useChatStore, type Artifact } from "@/stores/chatStore";

const INERT = "Not available in this build";

function Row({ icon, label, children }: { icon: ReactNode; label: string; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-1 text-sm leading-5">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-[4px] bg-surface-secondary text-icon-secondary" aria-hidden="true">
        {icon}
      </span>
      <span className="ml-1 shrink-0 text-text-secondary">{label}</span>
      {children !== undefined && (
        // long values (a model name) are cut short; the full text is on hover
        <span className="ml-auto min-w-0 truncate pl-3 text-right text-text-primary" title={typeof children === "string" ? children : undefined}>
          {children}
        </span>
      )}
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
  const ratio = assetRatio(asset.width, asset.height, asset.type === "video" ? 16 / 9 : 1);
  const label = asset.altText ?? (asset.type === "video" ? "Generated video" : "Generated image");

  if (!src || broken) {
    return (
      <div className="flex w-full items-center justify-center rounded-xl bg-surface-primary text-sm text-text-secondary" style={{ aspectRatio: ratio }}>
        {asset.type === "video" ? "Video unavailable" : "Image unavailable"}
      </div>
    );
  }
  if (asset.type === "video") {
    return <video key={src} src={src} controls preload="metadata" aria-label={label} className="max-h-[60vh] w-full rounded-xl bg-surface-primary" style={{ aspectRatio: ratio }} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- generated pictures come from anywhere
    <img key={src} src={src} alt={label} onError={() => setBroken(true)} className="max-h-[60vh] w-full rounded-xl bg-surface-primary object-contain" style={{ aspectRatio: ratio }} />
  );
}

function Details({ artifact }: { artifact: Artifact }) {
  const { asset, createdAt } = artifact;
  const { copied, copy } = useCopy();
  const link = safeAssetUrl(asset.url);
  const created = createdAt ? formatPreviewDate(createdAt) : "";
  const iconClass = "size-4";

  return (
    <>
      <div className="rounded-xl border border-line-tertiary bg-[#f8f8f8] p-4 dark:bg-surface-primary">
        {asset.prompt && (
          <>
            <div className="flex items-center gap-1">
              <Row icon={<FileText className={iconClass} />} label="Prompt" />
              <button
                type="button"
                onClick={() => copy("prompt", asset.prompt!)}
                className="ml-auto flex items-center gap-1 rounded-md text-sm text-text-secondary outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-ring"
              >
                {copied === "prompt" ? "Copied" : "Copy"}
                {copied === "prompt" ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
              </button>
            </div>
            <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-[10px] border-[0.5px] border-line-secondary bg-surface-secondary p-2 text-sm leading-5 text-text-primary">
              {asset.prompt}
            </p>
            <div className="my-3 h-px bg-line-tertiary" />
          </>
        )}
        <div className="space-y-4">
          {created && (
            <Row icon={<Calendar className={iconClass} />} label="Created on">
              {created}
            </Row>
          )}
          <Row icon={<Sparkles className={iconClass} />} label="Source">
            Generated in chat
          </Row>
          {asset.model && (
            <Row icon={<Wand2 className={iconClass} />} label="Model">
              {asset.model}
            </Row>
          )}
        </div>
        {asset.width && asset.height ? (
          <>
            <div className="my-3 h-px bg-line-tertiary" />
            <Row icon={<Ruler className={iconClass} />} label="Dimensions">
              {asset.width} X {asset.height}
            </Row>
          </>
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
    </>
  );
}

// The generated picture or video, beside the conversation. Always in the page, so opening and closing is
// a width change the conversation reflows around; on a phone it covers the screen instead.
export function ArtifactPanel() {
  const { isOpen, artifact } = useChatStore((s) => s.artifactPanel);
  const close = useChatStore((s) => s.closeArtifactPanel);
  const { chatId } = useParams<{ chatId?: string }>();
  const panel = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  // where focus was before a click opened the panel, to return it there on close
  const returnFocus = useRef<HTMLElement | null>(null);

  // it belongs to one task: moving to another task (or home) closes it
  useEffect(() => {
    if (isOpen && artifact && artifact.chatId !== chatId) close();
  }, [isOpen, artifact, chatId, close]);

  // a click moves focus into the panel; a picture that just finished generating doesn't take it from the composer
  useEffect(() => {
    if (!isOpen || artifact?.openedBy !== "user") return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButton.current?.focus({ preventScroll: true });
  }, [isOpen, artifact]);

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // Escape inside a menu or dialog closes that, not the panel
      const layer = event.target instanceof Element ? event.target.closest('[role="menu"],[role="dialog"],[role="alertdialog"],[role="listbox"]') : null;
      if (layer && layer !== panel.current) return;
      close();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, close]);

  // Give focus back to whatever opened the panel, if it is still there. A panel that opened by itself
  // has nothing to go back to; if focus was inside it, it goes to the message box rather than nowhere.
  useEffect(() => {
    if (isOpen) return;
    const target = returnFocus.current;
    returnFocus.current = null;
    if (target?.isConnected) return target.focus({ preventScroll: true });
    const lost = document.activeElement === document.body || panel.current?.contains(document.activeElement);
    if (lost) document.querySelector<HTMLTextAreaElement>("main textarea")?.focus({ preventScroll: true });
  }, [isOpen]);

  // On a phone the panel covers everything, so it behaves like a dialog: Tab stays inside it.
  const isDesktop = useIsDesktop();
  const modal = isOpen && !isDesktop;
  useEffect(() => {
    if (!modal) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab" || !panel.current) return;
      const focusable = [...panel.current.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],video[controls],[tabindex]:not([tabindex="-1"])')];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const inside = panel.current.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || !inside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !inside)) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [modal]);

  const title = artifact?.asset.type === "video" ? "Video Preview" : "Image Preview";

  return (
    <aside
      ref={panel}
      aria-label={title}
      role={modal ? "dialog" : undefined}
      aria-modal={modal || undefined}
      aria-hidden={!isOpen}
      inert={!isOpen}
      data-state={isOpen ? "open" : "closed"}
      className={cn(
        "overflow-hidden bg-background transition-[width,opacity,margin] duration-300 ease-out motion-reduce:transition-none",
        // a phone: the whole screen; wider: a column beside the conversation
        "max-md:fixed max-md:inset-0 max-md:z-40",
        "md:shrink-0 md:rounded-3xl md:border md:border-line-tertiary",
        // closed, it also gives back the shell's gap, so the conversation reaches the edge
        isOpen ? "visible opacity-100 max-md:w-full md:w-[420px]" : "invisible w-0 opacity-0 md:-ml-2 md:border-0",
      )}
    >
      <div className="flex h-full w-full flex-col md:w-[418px]">
        <div className="flex h-[60px] shrink-0 items-center gap-2 pl-5 pr-3">
          <h2 className="min-w-0 flex-1 truncate text-base font-semibold leading-7 text-text-primary">{title}</h2>
          <button
            ref={closeButton}
            type="button"
            aria-label="Close preview"
            onClick={close}
            className="flex size-9 items-center justify-center rounded-[10px] border border-line-tertiary bg-surface-primary text-text-primary outline-none hover:bg-surface-secondary focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" />
          </button>
        </div>
        {artifact && (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-5">
            <Media key={artifact.asset.url} artifact={artifact} />
            <Details artifact={artifact} />
          </div>
        )}
      </div>
    </aside>
  );
}

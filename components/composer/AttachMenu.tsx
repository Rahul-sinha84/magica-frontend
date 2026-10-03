"use client";

import { useRef, useState, type RefObject } from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { ImagePlus, Paperclip, Plus } from "lucide-react";
import { UPLOAD_ACCEPT } from "@/lib/uploadFiles";

interface Props {
  onPickFiles: (files: File[]) => void;
  onSelectAsset: () => void;
  triggerRef?: RefObject<HTMLButtonElement | null>;
}

// magica's paperclip: a small card with a way to pick from the media library, and one to upload from the device
// (any number of images, videos or audio files). It opens on whichever side of the paperclip has more room: above
// it (over the composer) on the home screen and in a task, below it once the page has scrolled the composer up.
export function AttachMenu({ onPickFiles, onSelectAsset, triggerRef }: Props) {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<"top" | "bottom">("top");
  const inputRef = useRef<HTMLInputElement>(null);
  const ownRef = useRef<HTMLButtonElement>(null);
  const trigger = triggerRef ?? ownRef;

  function onOpenChange(next: boolean) {
    const rect = trigger.current?.getBoundingClientRect();
    if (next && rect) setSide(window.innerHeight - rect.bottom > rect.top ? "bottom" : "top");
    setOpen(next);
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={UPLOAD_ACCEPT}
        aria-label="Upload files"
        tabIndex={-1}
        className="sr-only"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          // the same file can be picked again later
          event.target.value = "";
          onPickFiles(files);
        }}
      />
      <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <PopoverPrimitive.Trigger asChild>
          <button
            ref={trigger}
            type="button"
            aria-label="Attach files"
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-icon-secondary outline-none hover:bg-surface-secondary focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-surface-secondary"
          >
            <Paperclip className="size-4" strokeWidth={1.75} />
          </button>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            side={side}
            align="start"
            sideOffset={12}
            className="z-50 flex w-[246px] flex-col gap-3 rounded-[20px] border-[0.5px] border-line-tertiary bg-surface-secondary p-4 shadow-[var(--shadow-floating)] outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
          >
            <p className="text-xs font-medium text-text-primary">Add a file from your device or select one from your library</p>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onSelectAsset();
              }}
              className="flex h-10 items-center justify-center gap-2 rounded-[10px] bg-surface-primary px-4 text-sm font-medium text-text-primary outline-none hover:bg-surface-main focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ImagePlus className="size-4" aria-hidden="true" />
              Select Asset
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                inputRef.current?.click();
              }}
              // dark in both themes, as on magica
              className="flex h-10 items-center justify-center gap-2 rounded-[10px] bg-[#2b2b2b] px-4 text-sm font-medium text-white outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus className="size-4" aria-hidden="true" />
              Upload
            </button>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </>
  );
}

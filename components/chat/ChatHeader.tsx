"use client";

import Image from "next/image";
import { ChevronDown } from "lucide-react";
import { CreditsBadge } from "@/components/credits/CreditsBadge";
import { FolderOpenIcon, LayoutSidebarIcon } from "@/components/icons";
import { useMobileSidebar } from "@/stores/uiStore";

export function ChatHeader({ showFiles = false }: { showFiles?: boolean }) {
  const setSidebarOpen = useMobileSidebar((s) => s.setOpen);

  return (
    <header className="flex h-[52px] shrink-0 items-center gap-1 pl-3 pr-3 md:pl-4 md:pr-6">
      <button
        type="button"
        aria-label="Open sidebar"
        onClick={() => setSidebarOpen(true)}
        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-icon-primary outline-none hover:bg-surface-secondary focus-visible:ring-2 focus-visible:ring-ring md:hidden"
      >
        <LayoutSidebarIcon className="size-4" />
      </button>

      <button
        type="button"
        title="Model selection isn't available in this build"
        aria-disabled="true"
        className="flex h-7 min-w-0 items-center gap-2 rounded-lg px-2 text-sm text-text-primary outline-none hover:bg-surface-secondary focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Image src="/brand/magica-mark.svg" alt="" width={12} height={12} className="size-3 shrink-0 rounded-[3px] dark:invert" />
        <span className="truncate">Magica Auto</span>
        <ChevronDown className="size-3.5 shrink-0 text-icon-secondary" />
      </button>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {showFiles && (
          <button
            type="button"
            aria-label="View all files in this task"
            title="Not available in this build"
            aria-disabled="true"
            className="flex size-[37px] items-center justify-center rounded-full border-[0.5px] border-line-tertiary bg-surface-main-2 text-icon-primary outline-none hover:bg-surface-secondary focus-visible:ring-2 focus-visible:ring-ring"
          >
            <FolderOpenIcon className="size-5" />
          </button>
        )}
        <CreditsBadge />
      </div>
    </header>
  );
}

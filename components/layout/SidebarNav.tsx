"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { Boxes, CirclePlus, FolderOpen, LifeBuoy, MessageSquareMore, Sparkles } from "lucide-react";
import { ApiBookIcon, BooksIcon } from "@/components/icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useApiKeysDialog, useMobileSidebar } from "@/stores/uiStore";

interface Entry {
  label: string;
  icon: ComponentType<{ className?: string }>;
  href?: string;
  shortcut?: string;
  // opens the API Keys dialog
  apiKeys?: boolean;
}

// "New task" goes home and "API / MCP" opens the API Keys dialog; the rest are part of magica.com but outside
// this build.
const ENTRIES: Entry[] = [
  { label: "New task", icon: CirclePlus, href: "/chat", shortcut: "⌘⇧O" },
  { label: "Tasks", icon: MessageSquareMore },
  { label: "Projects", icon: FolderOpen },
  { label: "Library", icon: BooksIcon },
  { label: "Tools", icon: Boxes },
  { label: "API / MCP", icon: ApiBookIcon, apiKeys: true },
  { label: "Help & Support", icon: LifeBuoy },
  { label: "Unfair Advantage", icon: Sparkles },
];

function NavItem({ entry, rail }: { entry: Entry; rail: boolean }) {
  const { label, icon: Icon, href, shortcut } = entry;
  const openApiKeys = useApiKeysDialog((s) => s.setOpen);
  const closeDrawer = useMobileSidebar((s) => s.setOpen);
  const className = cn(
    "group flex h-[34px] w-full items-center gap-2.5 rounded-lg px-2 text-sm font-medium text-text-secondary outline-none hover:bg-surface-secondary hover:text-text-primary focus-visible:ring-2 focus-visible:ring-ring",
    rail && "size-[34px] justify-center px-0",
  );
  const content = (
    <>
      <Icon className="size-4 shrink-0" />
      {!rail && label}
      {!rail && shortcut && (
        <span className="ml-auto text-xs font-normal text-text-tertiary opacity-0 group-hover:opacity-100">
          {shortcut}
        </span>
      )}
    </>
  );
  const item = href ? (
    <Link href={href} aria-label={label} className={className}>
      {content}
    </Link>
  ) : entry.apiKeys ? (
    <button
      type="button"
      aria-label={label}
      aria-haspopup="dialog"
      onClick={() => {
        // on a phone, the dialog in place of the drawer
        closeDrawer(false);
        openApiKeys(true);
      }}
      className={className}
    >
      {content}
    </button>
  ) : (
    <button type="button" aria-label={label} aria-disabled="true" title="Not available in this build" className={className}>
      {content}
    </button>
  );

  if (!rail) return item;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{item}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

// As on magica, "New task" stays put at the top (`part="top"`) while the other entries scroll away with the task
// list below them (`part="rest"`).
export function SidebarNav({ rail, part }: { rail: boolean; part: "top" | "rest" }) {
  const entries = part === "top" ? ENTRIES.slice(0, 1) : ENTRIES.slice(1);
  const list = (
    <ul className="space-y-1">
      {entries.map((entry) => (
        <li key={entry.label}>
          <NavItem entry={entry} rail={rail} />
        </li>
      ))}
    </ul>
  );
  const className = cn("px-2 pb-1", rail && "flex flex-col items-center px-0");
  // the main navigation is the scrolling part; the one fixed row above it needs no landmark of its own
  return part === "top" ? (
    <div className={cn(className, "shrink-0")}>{list}</div>
  ) : (
    <nav aria-label="Main" className={className}>
      {list}
    </nav>
  );
}

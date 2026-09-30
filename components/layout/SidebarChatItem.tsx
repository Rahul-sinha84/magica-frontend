"use client";

import Link from "next/link";
import { ChevronRight, Copy, Ellipsis, FolderPlus, Pencil, Pin, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { chatTitle, cn } from "@/lib/utils";
import type { Chat } from "@/types";

interface Props {
  chat: Chat;
  active: boolean;
  onDelete: (chat: Chat) => void;
}

export function SidebarChatItem({ chat, active, onDelete }: Props) {
  const title = chatTitle(chat);
  return (
    <div
      className={cn(
        "group/item relative flex w-full items-center rounded-lg text-text-primary hover:bg-surface-secondary",
        active && "bg-surface-tertiary shadow-[inset_0_0_0_1px_var(--line-secondary)] hover:bg-surface-tertiary",
      )}
    >
      <Link
        href={`/chat/${encodeURIComponent(chat.id)}`}
        aria-current={active ? "page" : undefined}
        className="flex h-[34px] min-w-0 flex-1 items-center rounded-lg px-2 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring group-focus-within/item:pr-10 group-hover/item:pr-10 [@media(hover:none)]:pr-10"
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-sm font-medium text-text-secondary group-hover/item:text-text-primary",
            active && "text-text-primary",
          )}
        >
          {title}
        </span>
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Options for ${title}`}
            className="absolute right-1.5 flex size-6 items-center justify-center rounded text-text-secondary opacity-0 outline-none hover:bg-surface-tertiary focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-focus-within/item:opacity-100 group-hover/item:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100"
          >
            <Ellipsis className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start" className="w-48">
          <DropdownMenuItem disabled>
            <Pin /> Pin to top
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <Pencil /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <Copy /> Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <FolderPlus /> Add to project <ChevronRight className="ml-auto" />
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => onDelete(chat)}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

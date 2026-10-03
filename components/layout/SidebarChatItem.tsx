"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight, Copy, Ellipsis, FolderInput, Pencil, Pin, PinOff, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUpdateChat } from "@/hooks/useUpdateChat";
import { chatTitle, cn } from "@/lib/utils";
import type { Chat } from "@/types";

interface Props {
  chat: Chat;
  active: boolean;
  onDelete: (chat: Chat) => void;
}

// magica's rename, in place of the row: a pencil and the title, selected, in a small box. Enter (or clicking
// away) saves, Esc puts it back. A blank or unchanged title saves nothing.
function RenameRow({ chat, onDone }: { chat: Chat; onDone: (byKeyboard: boolean) => void }) {
  const update = useUpdateChat();
  const [value, setValue] = useState(chat.title);
  const inputRef = useRef<HTMLInputElement>(null);
  // finished (saved or cancelled): leaving the box after that changes nothing
  const done = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function finish(save: boolean, byKeyboard: boolean) {
    if (done.current) return;
    done.current = true;
    const title = value.trim();
    if (save && title && title !== chat.title) update.mutate({ chatId: chat.id, title });
    onDone(byKeyboard);
  }

  return (
    <div className="flex h-[42px] w-full items-center gap-1.5 rounded-[10px] bg-surface-secondary px-3 py-2">
      <Pencil className="size-3.5 shrink-0 text-text-primary" aria-hidden="true" />
      <input
        ref={inputRef}
        aria-label="Task name"
        value={value}
        maxLength={200}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            finish(true, true);
          } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            finish(false, true);
          }
        }}
        onBlur={() => finish(true, false)}
        className="h-[26px] min-w-0 flex-1 rounded-[2px] border border-[#8a8a8a] bg-surface-primary px-1.5 py-0.5 text-sm text-text-primary outline-none focus:shadow-[0_0_0_1px_rgba(59,130,246,0.5)]"
      />
    </div>
  );
}

export function SidebarChatItem({ chat, active, onDelete }: Props) {
  const title = chatTitle(chat);
  const update = useUpdateChat();
  const [renaming, setRenaming] = useState(false);
  const linkRef = useRef<HTMLAnchorElement>(null);
  // after a rename finished from the keyboard, focus goes back to the row
  const refocus = useRef(false);

  useEffect(() => {
    if (!renaming && refocus.current) {
      refocus.current = false;
      linkRef.current?.focus();
    }
  }, [renaming]);

  if (renaming) {
    return (
      <RenameRow
        chat={chat}
        onDone={(byKeyboard) => {
          refocus.current = byKeyboard;
          setRenaming(false);
        }}
      />
    );
  }

  return (
    <div
      className={cn(
        "group/item relative flex w-full items-center rounded-lg text-text-primary hover:bg-surface-secondary",
        active && "bg-surface-tertiary shadow-[inset_0_0_0_1px_var(--line-secondary)] hover:bg-surface-tertiary",
      )}
    >
      <Link
        ref={linkRef}
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
          <DropdownMenuItem onSelect={() => update.mutate({ chatId: chat.id, isPinned: !chat.isPinned })}>
            {chat.isPinned ? (
              <>
                <PinOff /> Unpin
              </>
            ) : (
              <>
                <Pin /> Pin to top
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setRenaming(true)}>
            <Pencil /> Rename
          </DropdownMenuItem>
          {/* the items this build can't do yet look like magica's (not faded), but can't be chosen */}
          <DropdownMenuItem disabled title="Not available in this build" className="data-disabled:opacity-100">
            <Copy /> Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem disabled title="Not available in this build" className="data-disabled:opacity-100">
            <FolderInput /> Add to project <ChevronRight className="ml-auto" />
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => onDelete(chat)}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

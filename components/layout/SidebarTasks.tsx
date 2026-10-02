"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useChats } from "@/hooks/useChats";
import { useDeleteChat } from "@/hooks/useDeleteChat";
import type { Chat } from "@/types";
import { DeleteChatDialog } from "./DeleteChatDialog";
import { SidebarChatItem } from "./SidebarChatItem";
import { SidebarSkeleton } from "./SidebarSkeleton";

const activity = (chat: Chat) => Date.parse(chat.lastMessageAt ?? chat.createdAt);
const byActivity = (a: Chat, b: Chat) => activity(b) - activity(a) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

export function SidebarTasks() {
  const { chats, isPending, refetch, hasNextPage, fetchNextPage, isFetchingNextPage, isFetchNextPageError } = useChats();
  const { chatId } = useParams<{ chatId?: string }>();
  const deleteChat = useDeleteChat();
  // the chat is kept after the dialog closes so its title doesn't vanish mid fade-out
  const [target, setTarget] = useState<Chat | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  if (isPending) return <SidebarSkeleton />;

  if (!chats) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-6 text-center text-sm text-text-secondary">
        <p role="alert">Couldn&apos;t load your tasks.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  if (chats.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-text-secondary">No tasks yet</p>;
  }

  // As on magica, pinned tasks have their own group above the recent ones. Each is in the server's order
  // (latest activity first), worked out here too so a pin or unpin moves the row before the server answers.
  const pinned = chats.filter((chat) => chat.isPinned).sort(byActivity);
  const recent = chats.filter((chat) => !chat.isPinned).sort(byActivity);
  const row = (chat: Chat) => (
    <li key={chat.id} className="[contain-intrinsic-size:auto_36px] [content-visibility:auto]">
      <SidebarChatItem
        chat={chat}
        active={chat.id === chatId}
        onDelete={(c) => {
          setTarget(c);
          setDialogOpen(true);
        }}
      />
    </li>
  );

  return (
    <>
      {pinned.length > 0 && (
        <section aria-label="Pinned tasks" className="mb-3">
          <div className="flex min-h-8 items-center px-2 py-1">
            <h2 className="text-xs font-normal text-text-secondary">Pinned tasks</h2>
          </div>
          <ul className="space-y-0.5">{pinned.map(row)}</ul>
        </section>
      )}
      <section aria-label="Recent tasks">
        <div className="group/tasks-header flex min-h-8 items-center justify-between px-2 py-1">
          <h2 className="text-xs font-normal text-text-secondary">Recent tasks</h2>
          {/* magica's link to the full task list shows on hover; that page isn't in this build */}
          <button
            type="button"
            title="Not available in this build"
            aria-disabled="true"
            className="rounded px-1 text-[10px] text-text-secondary opacity-0 outline-none transition-opacity focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/tasks-header:opacity-100 [@media(hover:none)]:opacity-100"
          >
            View all
          </button>
        </div>
        <ul className="mt-0.5 space-y-0.5">{recent.map(row)}</ul>
        {(hasNextPage || isFetchNextPageError) && (
          <div className="flex flex-col items-center gap-1 py-2">
            {isFetchNextPageError && (
              <p role="alert" className="text-xs text-text-secondary">
                Couldn&apos;t load more tasks.
              </p>
            )}
            <Button variant="ghost" size="sm" disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>
              {isFetchingNextPage ? "Loading…" : isFetchNextPageError ? "Try again" : "Show more"}
            </Button>
          </div>
        )}
        <DeleteChatDialog
          chat={target}
          open={dialogOpen}
          pending={deleteChat.isPending}
          onClose={() => setDialogOpen(false)}
          onConfirm={() => target && deleteChat.mutate(target.id, { onSettled: () => setDialogOpen(false) })}
        />
      </section>
    </>
  );
}

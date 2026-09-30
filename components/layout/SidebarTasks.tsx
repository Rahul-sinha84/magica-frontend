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

  return (
    <section aria-label="Recent tasks">
      <h2 className="flex min-h-8 items-center px-2 py-1 text-xs font-normal text-text-secondary">
        Recent tasks
      </h2>
      <ul className="mt-0.5 space-y-0.5">
        {chats.map((chat) => (
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
        ))}
      </ul>
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
  );
}

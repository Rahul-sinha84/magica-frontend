"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import { MessageCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SEARCH_QUERY_MIN } from "@/contracts";
import { useChats } from "@/hooks/useChats";
import { useChatSearch } from "@/hooks/useChatSearch";
import { chatTitle, cn } from "@/lib/utils";
import { useChatSearchPalette } from "@/stores/uiStore";
import type { Chat } from "@/types";

// magica's key chips: a hairline ring with a soft inner highlight
const chip =
  "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] px-1 font-sans font-medium leading-[18px] text-text-secondary shadow-[inset_0_1px_0.5px_rgba(255,255,255,0.6),0_1px_1.5px_rgba(0,0,0,0.08),0_0_0_0.5px_var(--line-secondary)]";
// load the next page this close to the end of the list
const NEAR_END_PX = 48;

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The title with what was searched for in bold, wherever it appears (case ignored), as magica shows it.
function Highlighted({ text, q }: { text: string; q: string }) {
  if (!q) return text;
  return text.split(new RegExp(`(${escapeRegExp(q)})`, "giu")).map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="font-bold text-text-primary">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

// Grey rows standing in for results while they load.
function SkeletonRows({ count }: { count: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} data-testid="search-skeleton" className="flex h-10 items-center gap-3 px-4">
          <div className="size-3.5 shrink-0 animate-pulse rounded-full bg-surface-secondary" />
          <div className="h-3.5 w-3/4 animate-pulse rounded bg-surface-secondary" />
        </div>
      ))}
    </div>
  );
}

function NoResults({ q }: { q: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-8 text-center">
      <div className="flex items-center justify-center rounded-full bg-surface-secondary p-4" aria-hidden="true">
        <Search className="size-5 text-text-secondary" />
      </div>
      <div className="mt-4 px-3 text-sm font-medium">
        <p className="text-text-primary">No tasks found</p>
        <p className="mt-2 text-text-secondary">
          We couldn&apos;t find any tasks matching &quot;{q}&quot;. Try a different keyword or open a recent task.
        </p>
      </div>
    </div>
  );
}

// a failed request, worded like the app's other error rows, with a way to try again
function ErrorRow({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-6 text-center text-sm text-text-secondary">
      <p role="alert">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

// What's inside the palette. It is mounted afresh each time the palette opens, so it starts empty.
function PaletteBody({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const search = useChatSearch(text);
  const recent = useChats();
  const ids = useId();
  const listId = `${ids}-list`;
  const optionId = (index: number) => `${ids}-option-${index}`;
  const scrollRef = useRef<HTMLDivElement>(null);

  // The recent tasks show until a search of at least SEARCH_QUERY_MIN characters is under way; as on
  // magica, the list changes once typing pauses. Under that length a hint says how much to type.
  const searching = search.active;
  const typed = text.trim().length;
  const hint = typed > 0 && typed < SEARCH_QUERY_MIN;
  const items: Chat[] = (searching ? search.chats : recent.chats) ?? [];

  // the highlighted row: the first recent task straight away; a search's results wait for ↓ (magica)
  const listKey = searching ? `search:${search.q}` : "recent";
  const startAt = searching ? -1 : 0;
  const [activeFor, setActiveFor] = useState({ key: listKey, index: startAt });
  const active = Math.min(activeFor.key === listKey ? activeFor.index : startAt, items.length - 1);
  const setActive = (index: number) => setActiveFor({ key: listKey, index });

  useEffect(() => {
    if (active >= 0) document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" });
    // optionId only depends on the stable `ids`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  function openChat(chat: Chat) {
    onClose();
    router.push(`/chat/${encodeURIComponent(chat.id)}`);
  }

  function newTask() {
    onClose();
    router.push("/chat");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (items.length === 0) return;
      setActive(event.key === "ArrowDown" ? Math.min(items.length - 1, active + 1) : Math.max(0, active - 1));
    } else if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      const chat = items[active];
      if (chat) openChat(chat);
    }
  }

  // the next page of results when the list is scrolled to its end
  function onScroll() {
    const el = scrollRef.current;
    if (!el || !searching || !search.hasNextPage || search.isFetchingNextPage || search.isFetchNextPageError) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_END_PX) void search.fetchNextPage();
  }

  const loading = searching ? search.isPending : recent.isPending;
  const failed = searching ? search.isError && !search.chats : !loading && !recent.chats;
  const ended = searching && !!search.chats && search.chats.length > 0 && !search.hasNextPage;
  const status = loading
    ? "Searching…"
    : searching && search.chats
      ? search.chats.length === 0
        ? "No tasks found"
        : `${search.chats.length} ${search.chats.length === 1 ? "task" : "tasks"} found${ended ? ". End of search results" : ""}`
      : "";

  let body;
  if (loading) {
    body = <SkeletonRows count={5} />;
  } else if (failed) {
    body = searching ? (
      <ErrorRow message="Couldn't search your tasks." onRetry={() => void search.refetch()} />
    ) : (
      <ErrorRow message="Couldn't load your tasks." onRetry={() => void recent.refetch()} />
    );
  } else if (searching && items.length === 0) {
    body = <NoResults q={search.q} />;
  } else if (items.length === 0) {
    body = <p className="px-3 py-6 text-center text-sm text-text-secondary">No tasks yet</p>;
  } else {
    body = (
      <>
        <div id={`${ids}-label`} className="px-3 pb-1 pt-2.5 text-[11px] font-medium leading-[16.5px] text-text-secondary">
          Tasks
        </div>
        <div role="listbox" id={listId} aria-labelledby={`${ids}-label`}>
          {items.map((chat, index) => (
            <div
              key={chat.id}
              id={optionId(index)}
              role="option"
              aria-selected={index === active}
              onPointerMove={() => index !== active && setActive(index)}
              onClick={() => openChat(chat)}
              className={cn(
                "flex h-10 cursor-pointer items-center gap-3 rounded-full px-4 text-sm font-medium text-text-secondary",
                index === active && "bg-surface-main text-text-primary",
              )}
            >
              <MessageCircle className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">
                <Highlighted text={chatTitle(chat)} q={searching ? search.q : ""} />
              </span>
            </div>
          ))}
        </div>
        {searching && search.isFetchingNextPage && <SkeletonRows count={1} />}
        {searching && search.isFetchNextPageError && (
          <ErrorRow message="Couldn't load more results." onRetry={() => void search.fetchNextPage()} />
        )}
        {ended && <p className="py-4 text-center text-xs font-medium text-text-tertiary">End of search results</p>}
      </>
    );
  }

  return (
    <>
      <div className="flex h-11 shrink-0 items-center gap-2.5 pl-4 pr-2">
        <Search className="size-4 shrink-0 text-text-tertiary" aria-hidden="true" />
        <input
          role="combobox"
          aria-label="Search projects and tasks"
          aria-expanded={items.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 && items[active] ? optionId(active) : undefined}
          autoFocus
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search"
          autoComplete="off"
          spellCheck={false}
          className="h-10 min-w-0 flex-1 bg-transparent py-3 text-sm font-medium text-text-primary outline-none placeholder:text-text-tertiary"
        />
        <DialogPrimitive.Close aria-label="Close" className="flex h-11 shrink-0 items-center px-2 outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <kbd className={cn(chip, "text-sm")}>esc</kbd>
        </DialogPrimitive.Close>
      </div>

      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto rounded-3xl bg-surface-primary px-1 pb-2 pt-1">
        {hint && <p className="px-3 pb-1 pt-2.5 text-sm text-text-tertiary">Type {SEARCH_QUERY_MIN}+ characters to search</p>}
        {body}
      </div>
      <p role="status" className="sr-only">
        {status}
      </p>

      <div className="flex h-12 shrink-0 items-center justify-end px-2 pt-1">
        <button
          type="button"
          onClick={newTask}
          aria-keyshortcuts="Meta+Shift+O Control+Shift+O"
          className="flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-text-primary outline-none hover:bg-surface-secondary focus-visible:ring-2 focus-visible:ring-ring"
        >
          New task
          <span className="flex gap-0.5" aria-hidden="true">
            <kbd className={cn(chip, "text-[10px]")}>⌘</kbd>
            <kbd className={cn(chip, "text-[10px]")}>⇧</kbd>
            <kbd className={cn(chip, "text-[10px]")}>O</kbd>
          </span>
        </button>
      </div>
    </>
  );
}

// magica's task search (⌘K or Ctrl+K, or the sidebar's search button): a panel in the middle of the screen
// over a softly blurred page. Recent tasks show until you type; a search covers titles and messages.
export function ChatSearchPalette() {
  const open = useChatSearchPalette((s) => s.open);
  const setOpen = useChatSearchPalette((s) => s.setOpen);

  // from anywhere, even while typing in the composer, as on magica
  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(!useChatSearchPalette.getState().open);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setOpen]);

  // opened by a shortcut rather than a trigger of its own: remember what had focus, and give it back on close
  const returnFocus = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (open) returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, [open]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 backdrop-blur-[1px] data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Content
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true });
          }}
          className="fixed left-1/2 top-1/2 z-50 flex h-[370px] max-h-[90vh] w-[calc(100vw-32px)] max-w-[512px] -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl bg-surface-main p-1 shadow-lg outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
        >
          <DialogPrimitive.Title className="sr-only">Search tasks</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Search your recent tasks and open an existing task or start a new one.
          </DialogPrimitive.Description>
          <PaletteBody onClose={() => setOpen(false)} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

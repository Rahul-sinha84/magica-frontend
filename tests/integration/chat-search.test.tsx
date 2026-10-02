import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChatSearchPalette } from "@/components/layout/ChatSearchPalette";
import { Sidebar } from "@/components/layout/Sidebar";
import { BACKEND_URL } from "@/lib/config";
import { useChatSearchPalette, useMobileSidebar, useUiStore } from "@/stores/uiStore";
import type { Chat } from "@/types";
import { getMockDb } from "../mocks/fixtures";
import { navigation } from "../mocks/navigation";
import { server } from "../mocks/server";
import { renderApp } from "../utils/render";

const searchUrl = `${BACKEND_URL}/api/chats/search`;

beforeEach(() => {
  useUiStore.setState({ sidebarCollapsed: false });
  useMobileSidebar.setState({ open: false });
  useChatSearchPalette.setState({ open: false });
});
afterEach(() => {
  server.events.removeAllListeners();
  toast.dismiss();
});

// every search request, from now on
function searches() {
  const seen: URL[] = [];
  server.events.on("request:start", ({ request }) => {
    const url = new URL(request.url);
    if (url.pathname === "/api/chats/search") seen.push(url);
  });
  return seen;
}

function renderShell() {
  return renderApp(
    <>
      <Sidebar />
      <ChatSearchPalette />
    </>,
  );
}

const palette = () => screen.queryByRole("dialog", { name: "Search tasks" });
const box = () => screen.getByRole("combobox", { name: "Search projects and tasks" });
const options = () => within(screen.getByRole("listbox")).getAllByRole("option");

async function openPalette() {
  const view = renderShell();
  await screen.findAllByRole("link", { name: /Greeting|Image of a Red Apple/ });
  await view.user.click(screen.getByRole("button", { name: "Search" }));
  await screen.findByRole("dialog", { name: "Search tasks" });
  return view;
}

// a chat whose title matches, with a message so it isn't empty
function addChat(id: string, title: string, minutesAgo: number) {
  const at = new Date(Date.now() - minutesAgo * 60_000).toISOString();
  const db = getMockDb();
  const chat: Chat = { id, title, userId: db.chats[0].userId, isPinned: false, createdAt: at, updatedAt: at, lastMessageAt: at };
  db.chats.push(chat);
  db.messages[id] = [];
}

describe("opening and closing the search palette", () => {
  it("opens with ⌘K and with Ctrl+K, from anywhere, focused on its box, and closes with Esc", async () => {
    const { user } = renderShell();
    await user.keyboard("{Meta>}k{/Meta}");
    expect(await screen.findByRole("dialog", { name: "Search tasks" })).toBeInTheDocument();
    expect(box()).toHaveFocus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(palette()).not.toBeInTheDocument());

    await user.keyboard("{Control>}k{/Control}");
    expect(await screen.findByRole("dialog", { name: "Search tasks" })).toBeInTheDocument();
  });

  it("opens from the sidebar's search button, and gives focus back to it on close", async () => {
    const { user } = renderShell();
    const button = screen.getByRole("button", { name: "Search" });
    await user.click(button);
    await screen.findByRole("dialog", { name: "Search tasks" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(palette()).not.toBeInTheDocument());
    expect(button).toHaveFocus();
  });

  it("opens from the collapsed sidebar's search button too", async () => {
    useUiStore.setState({ sidebarCollapsed: true });
    const { user } = renderShell();
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByRole("dialog", { name: "Search tasks" })).toBeInTheDocument();
  });

  it("closes from its esc chip", async () => {
    const { user } = await openPalette();
    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(palette()).not.toBeInTheDocument());
  });
});

describe("searching", () => {
  it("shows the recent tasks, first one highlighted, and asks nothing, until there are 3 characters", async () => {
    const seen = searches();
    const { user } = await openPalette();
    expect(within(palette()!).getByText("Tasks")).toBeInTheDocument();
    expect(options().map((o) => o.textContent)).toEqual(["Image of a Red Apple on a White Table", "Greeting"]);
    expect(options()[0]).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText(/Type 3\+ characters/)).not.toBeInTheDocument();

    await user.type(box(), "ap");
    expect(screen.getByText("Type 3+ characters to search")).toBeInTheDocument();
    expect(options()).toHaveLength(2);
    await new Promise((r) => setTimeout(r, 400));
    expect(seen).toHaveLength(0);
  });

  it("asks once typing pauses, with the trimmed text", async () => {
    const seen = searches();
    const { user } = await openPalette();
    await user.type(box(), "  apple  ");
    await waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0].searchParams.get("q")).toBe("apple");
    await new Promise((r) => setTimeout(r, 400));
    expect(seen).toHaveLength(1);
  });

  it("shows grey rows while it searches, then the results with the match in bold, then the end", async () => {
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    server.use(
      http.get(searchUrl, async () => {
        await held;
        return undefined;
      }),
    );
    const { user } = await openPalette();
    await user.type(box(), "apple");
    await waitFor(() => expect(screen.getAllByTestId("search-skeleton")).toHaveLength(5));
    expect(screen.getByRole("status")).toHaveTextContent("Searching…");

    release();
    await waitFor(() => expect(options()).toHaveLength(1));
    expect(options()[0]).toHaveTextContent("Image of a Red Apple on a White Table");
    expect(within(options()[0]).getByText("Apple")).toHaveClass("font-bold");
    expect(options()[0]).toHaveAttribute("aria-selected", "false"); // nothing chosen until ↓, as on magica
    expect(screen.getByText("End of search results")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("1 task found. End of search results");
  });

  it("finds a chat by a word that is only in its messages", async () => {
    const { user } = await openPalette();
    await user.type(box(), "help you");
    await waitFor(() => expect(options().map((o) => o.textContent)).toEqual(["Greeting"]));
  });

  it("says so when nothing matches", async () => {
    const { user } = await openPalette();
    await user.type(box(), "zqxjkvw");
    expect(await screen.findByText("No tasks found", { selector: "p:not([role=status])" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("No tasks found");
    expect(screen.getByText(`We couldn't find any tasks matching "zqxjkvw". Try a different keyword or open a recent task.`)).toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("shows only the latest query's results, even when an earlier answer arrives last", async () => {
    let releaseFirst = () => {};
    const first = new Promise<void>((resolve) => (releaseFirst = resolve));
    server.use(
      http.get(searchUrl, async ({ request }) => {
        if (new URL(request.url).searchParams.get("q") === "apple") await first;
        return undefined;
      }),
    );
    const { user } = await openPalette();
    await user.type(box(), "apple");
    await waitFor(() => expect(screen.getAllByTestId("search-skeleton").length).toBeGreaterThan(0));
    await user.clear(box());
    await user.type(box(), "greeting");
    await waitFor(() => expect(options().map((o) => o.textContent)).toEqual(["Greeting"]));

    releaseFirst();
    await new Promise((r) => setTimeout(r, 100));
    expect(options().map((o) => o.textContent)).toEqual(["Greeting"]);
  });

  it("loads the next page when the list is scrolled to its end", async () => {
    for (let i = 0; i < 25; i++) addChat(`chat-report-${i}`, `Weekly report ${i}`, 100 + i);
    const seen = searches();
    const { user } = await openPalette();
    await user.type(box(), "report");
    await waitFor(() => expect(options()).toHaveLength(20));
    expect(screen.queryByText("End of search results")).not.toBeInTheDocument();

    const list = screen.getByRole("listbox").parentElement!;
    Object.defineProperties(list, {
      scrollHeight: { configurable: true, value: 1000 },
      clientHeight: { configurable: true, value: 270 },
      scrollTop: { configurable: true, value: 700 },
    });
    fireEvent.scroll(list);
    await waitFor(() => expect(options()).toHaveLength(25));
    expect(seen.at(-1)!.searchParams.get("cursor")).toBe("20");
    expect(screen.getByText("End of search results")).toBeInTheDocument();
  });

  it("says when the search failed, and tries again", async () => {
    let fail = true;
    server.use(http.get(searchUrl, () => (fail ? HttpResponse.json({ error: "down", code: "INTERNAL_ERROR" }, { status: 500 }) : undefined)));
    const { user } = await openPalette();
    await user.type(box(), "apple");
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't search your tasks.");

    fail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(options()).toHaveLength(1));
  });
});

describe("choosing", () => {
  it("moves with ↓ and ↑ and opens the chosen task with Enter, closing the palette", async () => {
    const { user } = await openPalette();
    expect(box()).toHaveAttribute("aria-activedescendant", options()[0].id);
    await user.keyboard("{ArrowDown}");
    expect(options()[1]).toHaveAttribute("aria-selected", "true");
    expect(box()).toHaveAttribute("aria-activedescendant", options()[1].id);
    await user.keyboard("{ArrowDown}"); // already the last: stays
    await user.keyboard("{ArrowUp}{ArrowDown}");
    await user.keyboard("{Enter}");
    expect(navigation.push).toHaveBeenCalledWith("/chat/chat-greeting");
    await waitFor(() => expect(palette()).not.toBeInTheDocument());
  });

  it("chooses a search result with ↓ then Enter", async () => {
    const { user } = await openPalette();
    await user.type(box(), "apple");
    await waitFor(() => expect(options()).toHaveLength(1));
    await user.keyboard("{Enter}"); // nothing chosen yet
    expect(navigation.push).not.toHaveBeenCalled();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(navigation.push).toHaveBeenCalledWith("/chat/chat-apple");
  });

  it("opens a task on click", async () => {
    const { user } = await openPalette();
    await user.click(options()[1]);
    expect(navigation.push).toHaveBeenCalledWith("/chat/chat-greeting");
  });

  it("starts a new task from its footer", async () => {
    const { user } = await openPalette();
    await user.click(screen.getByRole("button", { name: /New task/ }));
    expect(navigation.push).toHaveBeenCalledWith("/chat");
    await waitFor(() => expect(palette()).not.toBeInTheDocument());
  });

  it("toggles with ⌘K", async () => {
    const { user } = await openPalette();
    await act(async () => {
      await user.keyboard("{Meta>}k{/Meta}");
    });
    await waitFor(() => expect(palette()).not.toBeInTheDocument());
  });
});

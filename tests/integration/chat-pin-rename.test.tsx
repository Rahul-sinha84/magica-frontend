import { screen, waitFor, within } from "@testing-library/react";
import { delay, http, HttpResponse } from "msw";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { Sidebar } from "@/components/layout/Sidebar";
import { BACKEND_URL } from "@/lib/config";
import { useMobileSidebar, useUiStore } from "@/stores/uiStore";
import { getMockDb } from "../mocks/fixtures";
import { navigation } from "../mocks/navigation";
import { server } from "../mocks/server";
import { renderApp } from "../utils/render";
import { stubLayout } from "../utils/layout";

stubLayout();

const chatUrl = `${BACKEND_URL}/api/chats/:chatId`;
const APPLE = "Image of a Red Apple on a White Table";

beforeEach(() => {
  useUiStore.setState({ sidebarCollapsed: false });
  useMobileSidebar.setState({ open: false });
});
afterEach(() => {
  server.events.removeAllListeners();
  toast.dismiss();
});

// the body of every PATCH, from now on
function patches() {
  const bodies: unknown[] = [];
  server.events.on("request:start", async ({ request }) => {
    if (request.method === "PATCH") bodies.push(await request.clone().json());
  });
  return bodies;
}

// the sidebar, beside the apple chat's own page
async function renderAppleOpen() {
  navigation.params = { chatId: "chat-apple" };
  navigation.pathname = "/chat/chat-apple";
  const view = renderApp(
    <>
      <Sidebar />
      <main>
        <ChatWindow chatId="chat-apple" />
      </main>
    </>,
  );
  await screen.findByRole("link", { name: "Greeting" });
  return view;
}

const section = (name: string) => screen.queryByRole("region", { name });
const titlesIn = (name: string) => within(section(name)!).getAllByRole("link").map((link) => link.textContent);

async function choose(user: ReturnType<typeof renderApp>["user"], title: string, item: string | RegExp) {
  await user.click(screen.getByRole("button", { name: `Options for ${title}` }));
  await user.click(await screen.findByRole("menuitem", { name: item }));
}

describe("pinning", () => {
  it("moves the chat into Pinned tasks at once, and Unpin puts it back in its place", async () => {
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    server.use(
      http.patch(chatUrl, async () => {
        await held;
        return undefined;
      }),
    );
    const sent = patches();
    const { user } = await renderAppleOpen();
    expect(section("Pinned tasks")).not.toBeInTheDocument();
    expect(titlesIn("Recent tasks")).toEqual([APPLE, "Greeting"]);

    await choose(user, "Greeting", "Pin to top");
    // before the server has answered
    expect(titlesIn("Pinned tasks")).toEqual(["Greeting"]);
    expect(titlesIn("Recent tasks")).toEqual([APPLE]);
    release();
    await waitFor(() => expect(getMockDb().chats.find((c) => c.id === "chat-greeting")?.isPinned).toBe(true));
    expect(sent).toEqual([{ isPinned: true }]);

    await choose(user, "Greeting", "Unpin");
    await waitFor(() => expect(section("Pinned tasks")).not.toBeInTheDocument());
    expect(titlesIn("Recent tasks")).toEqual([APPLE, "Greeting"]);
    await waitFor(() => expect(getMockDb().chats.find((c) => c.id === "chat-greeting")?.isPinned).toBe(false));
  });

  it("puts the chat back, with a toast, when the server refuses", async () => {
    server.use(http.patch(chatUrl, () => HttpResponse.json({ error: "Something went wrong", code: "INTERNAL_ERROR" }, { status: 500 })));
    const { user } = await renderAppleOpen();
    await choose(user, "Greeting", "Pin to top");
    expect(await screen.findByText("Couldn't pin the task")).toBeInTheDocument();
    expect(section("Pinned tasks")).not.toBeInTheDocument();
    expect(titlesIn("Recent tasks")).toEqual([APPLE, "Greeting"]);
  });
});

describe("renaming", () => {
  async function startRename(user: ReturnType<typeof renderApp>["user"], title: string) {
    await choose(user, title, "Rename");
    const box = await screen.findByRole("textbox", { name: "Task name" });
    await waitFor(() => expect(box).toHaveFocus());
    return box as HTMLInputElement;
  }

  it("edits the title in place, saves on Enter, and the page title and heading follow", async () => {
    const sent = patches();
    const { user } = await renderAppleOpen();
    await waitFor(() => expect(document.title).toBe(`${APPLE} | Magica`));
    const box = await startRename(user, APPLE);
    expect(box.value).toBe(APPLE);
    expect([box.selectionStart, box.selectionEnd]).toEqual([0, APPLE.length]); // all selected, as on magica

    await user.keyboard("A red apple{Enter}");
    expect(screen.getByRole("link", { name: "A red apple" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "A red apple" })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe("A red apple | Magica"));
    await waitFor(() => expect(getMockDb().chats.find((c) => c.id === "chat-apple")?.title).toBe("A red apple"));
    expect(sent).toEqual([{ title: "A red apple" }]);
    // back on the row, for the keyboard
    expect(screen.getByRole("link", { name: "A red apple" })).toHaveFocus();
  });

  it("puts the title back on Esc, and saves when you click away", async () => {
    const sent = patches();
    const { user } = await renderAppleOpen();
    await startRename(user, "Greeting");
    await user.keyboard("Hello there{Escape}");
    expect(screen.getByRole("link", { name: "Greeting" })).toBeInTheDocument();
    expect(sent).toHaveLength(0);

    await startRename(user, "Greeting");
    await user.keyboard("Hello there");
    await user.click(document.body);
    expect(await screen.findByRole("link", { name: "Hello there" })).toBeInTheDocument();
    await waitFor(() => expect(sent).toEqual([{ title: "Hello there" }]));
  });

  it("sends nothing for a blank or unchanged title", async () => {
    const sent = patches();
    const { user } = await renderAppleOpen();
    await startRename(user, "Greeting");
    await user.keyboard("{Backspace}   {Enter}");
    expect(screen.getByRole("link", { name: "Greeting" })).toBeInTheDocument();

    await startRename(user, "Greeting");
    await user.keyboard("{Enter}");
    await new Promise((r) => setTimeout(r, 100));
    expect(sent).toHaveLength(0);
  });

  it("puts the old title back, with a toast, when saving fails", async () => {
    server.use(http.patch(chatUrl, async () => {
      await delay(50);
      return HttpResponse.json({ error: "Something went wrong", code: "INTERNAL_ERROR" }, { status: 500 });
    }));
    const { user } = await renderAppleOpen();
    await startRename(user, "Greeting");
    await user.keyboard("Renamed{Enter}");
    expect(screen.getByRole("link", { name: "Renamed" })).toBeInTheDocument(); // at once
    expect(await screen.findByText("Couldn't rename the task")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Greeting" })).toBeInTheDocument();
  });

  it("shows the server's reason when it refuses a title", async () => {
    const { user } = await renderAppleOpen();
    await startRename(user, "Greeting");
    // only a zero-width space: not blank to the eye of a trim, but the server wants a visible character
    await user.keyboard("​{Enter}");
    expect(await screen.findByText("Couldn't rename the task")).toBeInTheDocument();
    expect(screen.getByText("title: Title needs at least one visible character.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Greeting" })).toBeInTheDocument();
  });

  it("drops the chat when the server no longer has it, and leaves its page", async () => {
    // deleted elsewhere in the meantime
    server.use(
      http.patch(chatUrl, ({ params }) => {
        const db = getMockDb();
        db.chats = db.chats.filter((chat) => chat.id !== params.chatId);
        return HttpResponse.json({ error: "Chat not found", code: "NOT_FOUND" }, { status: 404 });
      }),
    );
    const { user } = await renderAppleOpen();
    await startRename(user, APPLE);
    await user.keyboard("Gone{Enter}");
    await waitFor(() => expect(screen.queryByRole("link", { name: /Gone|Red Apple/ })).not.toBeInTheDocument());
    expect(navigation.replace).toHaveBeenCalledWith("/chat");
    expect(screen.queryByText("Couldn't rename the task")).not.toBeInTheDocument();
  });
});

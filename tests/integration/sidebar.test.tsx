import { screen, waitFor } from "@testing-library/react";
import { delay, http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "@/components/layout/Sidebar";
import { BACKEND_URL } from "@/lib/config";
import { useMobileSidebar, useUiStore } from "@/stores/uiStore";
import { getMockDb } from "../mocks/fixtures";
import { navigation } from "../mocks/navigation";
import { server } from "../mocks/server";
import { renderApp } from "../utils/render";

const at = (path: string) => `${BACKEND_URL}${path}`;
const listChats = (chats: unknown[]) => http.get(at("/api/chats"), () => HttpResponse.json({ chats }));

beforeEach(() => {
  useUiStore.setState({ sidebarCollapsed: false });
  useMobileSidebar.setState({ open: false });
});

async function openDeleteDialog(user: ReturnType<typeof renderApp>["user"], title: string) {
  await user.click(await screen.findByRole("button", { name: `Options for ${title}` }));
  await user.click(await screen.findByRole("menuitem", { name: /delete/i }));
  return screen.findByRole("dialog");
}

describe("recent tasks", () => {
  it("lists the user's tasks, newest first, each linking to its page", async () => {
    renderApp(<Sidebar />);
    const apple = await screen.findByRole("link", { name: "Image of a Red Apple on a White Table" });
    const greeting = screen.getByRole("link", { name: "Greeting" });

    expect(apple).toHaveAttribute("href", "/chat/chat-apple");
    expect(greeting).toHaveAttribute("href", "/chat/chat-greeting");
    expect(apple.compareDocumentPosition(greeting) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows a loading state while the list loads", async () => {
    server.use(
      http.get(at("/api/chats"), async () => {
        await delay(150);
        return HttpResponse.json({ chats: [] });
      }),
    );
    renderApp(<Sidebar />);
    expect(screen.getByLabelText("Loading tasks")).toBeInTheDocument();
    expect(await screen.findByText("No tasks yet")).toBeInTheDocument();
    expect(screen.queryByLabelText("Loading tasks")).not.toBeInTheDocument();
  });

  it("says so when there are no tasks, and hides the section heading", async () => {
    server.use(listChats([]));
    renderApp(<Sidebar />);
    expect(await screen.findByText("No tasks yet")).toBeInTheDocument();
    expect(screen.queryByText("Recent tasks")).not.toBeInTheDocument();
  });

  it("offers a retry when the list can't be loaded", async () => {
    server.use(http.get(at("/api/chats"), () => HttpResponse.json({ error: "down" }, { status: 500 }), { once: true }));
    const { user } = renderApp(<Sidebar />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load your tasks.");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: "Greeting" })).toBeInTheDocument();
  });

  it("keeps showing the tasks when a later refresh fails", async () => {
    const { client } = renderApp(<Sidebar />);
    await screen.findByRole("link", { name: "Greeting" });

    server.use(http.get(at("/api/chats"), () => HttpResponse.json({ error: "down" }, { status: 500 })));
    await client.invalidateQueries({ queryKey: ["chats"] });

    expect(screen.getByRole("link", { name: "Greeting" })).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load your tasks.")).not.toBeInTheDocument();
  });

  it("marks the open task as the current page", async () => {
    navigation.params = { chatId: "chat-greeting" };
    renderApp(<Sidebar />);
    expect(await screen.findByRole("link", { name: "Greeting" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Red Apple/ })).not.toHaveAttribute("aria-current");
  });

  it("escapes awkward ids in links", async () => {
    const chat = { ...getMockDb().chats[0], id: "a b/c", title: "Odd id" };
    server.use(listChats([chat]));
    renderApp(<Sidebar />);
    expect(await screen.findByRole("link", { name: "Odd id" })).toHaveAttribute("href", "/chat/a%20b%2Fc");
  });

  it("keeps a very long title on one line", async () => {
    const chat = { ...getMockDb().chats[0], title: "x".repeat(300) };
    server.use(listChats([chat]));
    renderApp(<Sidebar />);
    expect(await screen.findByText("x".repeat(300))).toHaveClass("truncate");
  });
});

describe("navigation", () => {
  it("sends New task to the home screen", () => {
    renderApp(<Sidebar />);
    expect(screen.getByRole("link", { name: "New task" })).toHaveAttribute("href", "/chat");
  });

  it("leaves the pages outside this build inert", async () => {
    const { user } = renderApp(<Sidebar />);
    for (const name of ["Tasks", "Projects", "Library", "Tools", "API / MCP", "Help & Support", "Unfair Advantage"]) {
      await user.click(screen.getByRole("button", { name }));
    }
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("starts a new task with ⌘⇧O", async () => {
    const { user } = renderApp(<Sidebar />);
    await user.keyboard("{Meta>}{Shift>}o{/Shift}{/Meta}");
    expect(navigation.push).toHaveBeenCalledWith("/chat");
  });

  it("starts a new task with Ctrl⇧O too", async () => {
    const { user } = renderApp(<Sidebar />);
    await user.keyboard("{Control>}{Shift>}o{/Shift}{/Control}");
    expect(navigation.push).toHaveBeenCalledWith("/chat");
  });
});

describe("deleting a task", () => {
  it("asks first, then deletes and removes it from the list", async () => {
    const deleted = vi.fn();
    server.use(
      http.delete(at("/api/chats/:chatId"), ({ params }) => {
        deleted(params.chatId);
        getMockDb().chats = getMockDb().chats.filter((c) => c.id !== params.chatId);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = renderApp(<Sidebar />);

    const dialog = await openDeleteDialog(user, "Greeting");
    expect(dialog).toHaveTextContent("Delete this task?");
    expect(dialog).toHaveTextContent("Greeting");
    expect(deleted).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByRole("link", { name: "Greeting" })).not.toBeInTheDocument());
    expect(deleted).toHaveBeenCalledWith("chat-greeting");
    expect(screen.getByRole("link", { name: /Red Apple/ })).toBeInTheDocument();
  });

  it("does nothing when you cancel", async () => {
    const deleted = vi.fn();
    server.use(http.delete(at("/api/chats/:chatId"), () => (deleted(), new HttpResponse(null, { status: 204 }))));
    const { user } = renderApp(<Sidebar />);

    await openDeleteDialog(user, "Greeting");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(deleted).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Greeting" })).toBeInTheDocument();
  });

  it("leaves the page when the open task is deleted", async () => {
    navigation.params = { chatId: "chat-greeting" };
    const { user } = renderApp(<Sidebar />);

    await openDeleteDialog(user, "Greeting");
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/chat"));
  });

  it("stays on the page when a different task is deleted", async () => {
    navigation.params = { chatId: "chat-apple" };
    const { user } = renderApp(<Sidebar />);

    await openDeleteDialog(user, "Greeting");
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(screen.queryByRole("link", { name: "Greeting" })).not.toBeInTheDocument());
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("explains a failure and keeps the task", async () => {
    server.use(http.delete(at("/api/chats/:chatId"), () => HttpResponse.json({ error: "Database is down" }, { status: 500 })));
    const { user } = renderApp(<Sidebar />);

    await openDeleteDialog(user, "Greeting");
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("Couldn't delete the task")).toBeInTheDocument();
    expect(screen.getByText("Database is down")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Greeting" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("treats a task that is already gone as deleted, without an error", async () => {
    const greeting = getMockDb().chats.find((c) => c.id === "chat-greeting")!;
    const { user, client } = renderApp(<Sidebar />);
    await screen.findByRole("link", { name: "Greeting" });

    // another tab deletes it; this tab's list still shows it
    getMockDb().chats = getMockDb().chats.filter((c) => c.id !== "chat-greeting");
    client.setQueryData(["chats"], [...getMockDb().chats, greeting]);
    server.use(http.delete(at("/api/chats/:chatId"), () => HttpResponse.json({ error: "Chat not found" }, { status: 404 })));

    await openDeleteDialog(user, "Greeting");
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(screen.queryByRole("link", { name: "Greeting" })).not.toBeInTheDocument());
    expect(screen.queryByText("Couldn't delete the task")).not.toBeInTheDocument();
  });
});

describe("collapsing", () => {
  it("shrinks to an icon rail and remembers it", async () => {
    const { user } = renderApp(<Sidebar />);
    await screen.findByRole("link", { name: "Greeting" });

    await user.click(screen.getByRole("button", { name: "Close sidebar" }));

    expect(screen.queryByText("Recent tasks")).not.toBeInTheDocument();
    expect(screen.queryByText("Available Credits")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open sidebar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New task" })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("magica-ui") ?? "{}").state.sidebarCollapsed).toBe(true);
  });

  it("comes back with its tasks", async () => {
    useUiStore.setState({ sidebarCollapsed: true });
    const { user } = renderApp(<Sidebar />);

    await user.click(screen.getByRole("button", { name: "Open sidebar" }));

    expect(await screen.findByRole("link", { name: "Greeting" })).toBeInTheDocument();
    expect(screen.getByText("Recent tasks")).toBeInTheDocument();
  });
});

describe("footer", () => {
  it("shows the credit balance", async () => {
    renderApp(<Sidebar />);
    expect(await screen.findByText("29.66M")).toBeInTheDocument();
  });

  it("shows a dash instead of a wrong number when credits can't be loaded", async () => {
    server.use(http.get(at("/api/credits"), () => HttpResponse.json({ error: "x" }, { status: 500 })));
    renderApp(<Sidebar />);
    await screen.findByRole("link", { name: "Greeting" });
    await waitFor(() => expect(screen.getByText("Available Credits").nextSibling).toHaveTextContent("—"));
  });

  it("tucks the account shortcuts away with Less and brings them back with More", async () => {
    const { user } = renderApp(<Sidebar />);
    expect(screen.getByText("Available Credits")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Less" }));
    expect(screen.queryByText("Available Credits")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add Credits/ })).not.toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Theme" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByText("Available Credits")).toBeInTheDocument();
  });
});

import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { AppShell } from "@/components/layout/AppShell";
import { useMobileSidebar, useUiStore } from "@/stores/uiStore";
import { setViewport } from "../setup";
import { clerkState } from "../mocks/clerk";
import { navigation } from "../mocks/navigation";
import { renderApp } from "../utils/render";

beforeEach(() => {
  useUiStore.setState({ sidebarCollapsed: false });
  useMobileSidebar.setState({ open: false });
});

const sidebar = () => screen.getByRole("complementary", { name: "Sidebar", hidden: true });

describe("remembering the sidebar", () => {
  it("restores a collapsed sidebar after the page loads", async () => {
    localStorage.setItem("magica-ui", JSON.stringify({ state: { sidebarCollapsed: true }, version: 0 }));
    renderApp(<AppShell>content</AppShell>);
    expect(await screen.findByRole("button", { name: "Open sidebar" })).toBeInTheDocument();
  });

  it("starts expanded when nothing was saved", async () => {
    renderApp(<AppShell>content</AppShell>);
    expect(await screen.findByRole("button", { name: "Close sidebar" })).toBeInTheDocument();
  });

  it("starts expanded when the saved value is garbage", async () => {
    localStorage.setItem("magica-ui", "{{{ not json");
    renderApp(<AppShell>content</AppShell>);
    expect(await screen.findByRole("button", { name: "Close sidebar" })).toBeInTheDocument();
  });
});

describe("with storage blocked", () => {
  it("still renders the app instead of crashing", async () => {
    // zustand leaves `persist` undefined when storage is unavailable (private mode, blocked site data)
    const persist = useUiStore.persist;
    Object.defineProperty(useUiStore, "persist", { value: undefined, configurable: true });
    try {
      renderApp(<AppShell>content</AppShell>);
      expect(await screen.findByText("content")).toBeInTheDocument();
    } finally {
      Object.defineProperty(useUiStore, "persist", { value: persist, configurable: true });
    }
  });
});

describe("on a phone", () => {
  beforeEach(() => setViewport(false));

  it("keeps the sidebar out of reach until you open it", async () => {
    const { user } = renderApp(
      <AppShell>
        <ChatHeader />
      </AppShell>,
    );
    expect(sidebar()).toHaveAttribute("inert");

    await user.click(screen.getAllByRole("button", { name: "Open sidebar" })[0]);
    await waitFor(() => expect(sidebar()).not.toHaveAttribute("inert"));
  });

  it("closes with the close button, the backdrop or Escape", async () => {
    const { user, container } = renderApp(
      <AppShell>
        <ChatHeader />
      </AppShell>,
    );
    const open = () => user.click(screen.getAllByRole("button", { name: "Open sidebar" })[0]);

    await open();
    await user.click(screen.getByRole("button", { name: "Close sidebar" }));
    await waitFor(() => expect(sidebar()).toHaveAttribute("inert"));

    await open();
    await user.click(container.querySelector('[aria-hidden="true"].fixed') as HTMLElement);
    await waitFor(() => expect(sidebar()).toHaveAttribute("inert"));

    await open();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(sidebar()).toHaveAttribute("inert"));
  });

  it("closes itself after you pick a task", async () => {
    const { user, rerender } = renderApp(
      <AppShell>
        <ChatHeader />
      </AppShell>,
    );
    await user.click(screen.getAllByRole("button", { name: "Open sidebar" })[0]);
    expect(useMobileSidebar.getState().open).toBe(true);

    navigation.pathname = "/chat/chat-greeting";
    rerender(
      <AppShell>
        <ChatHeader />
      </AppShell>,
    );
    await waitFor(() => expect(useMobileSidebar.getState().open).toBe(false));
  });

  it("ignores a saved collapsed state, because the drawer is always the full sidebar", async () => {
    localStorage.setItem("magica-ui", JSON.stringify({ state: { sidebarCollapsed: true }, version: 0 }));
    renderApp(<AppShell>content</AppShell>);
    await waitFor(() => expect(useUiStore.getState().sidebarCollapsed).toBe(true));

    expect(screen.getByRole("button", { name: "Close sidebar", hidden: true })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Greeting", hidden: true })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open sidebar", hidden: true })).not.toBeInTheDocument();
  });
});

describe("the session", () => {
  it("sends you to sign-in if it ends while you are using the app", () => {
    Object.assign(clerkState, { isSignedIn: false });
    renderApp(<AppShell>content</AppShell>);
    expect(screen.getByTestId("redirect-to-sign-in")).toBeInTheDocument();
  });
});

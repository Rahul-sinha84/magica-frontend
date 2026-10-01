import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ArtifactPanel } from "@/components/chat/ArtifactPanel";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { useChatStore } from "@/stores/chatStore";
import { getMockDb } from "../mocks/fixtures";
import { navigation } from "../mocks/navigation";
import { realtime } from "../mocks/trigger";
import { renderApp, typeAndSend } from "../utils/render";
import { stubLayout } from "../utils/layout";

stubLayout();

function openTask(chatId: string) {
  navigation.params = { chatId };
  navigation.pathname = `/chat/${chatId}`;
  // laid out like the app shell: the conversation in <main>, the panel beside it
  return renderApp(
    <>
      <main>
        <ChatWindow key={chatId} chatId={chatId} />
      </main>
      <ArtifactPanel />
    </>,
  );
}

// found by its label directly: a closed panel is hidden from the accessibility tree, so role queries skip its name
const panel = () => {
  const found = document.querySelector<HTMLElement>('aside[aria-label$="Preview"]');
  if (!found) throw new Error("no preview panel");
  return found;
};
const isOpen = () => panel().getAttribute("data-state") === "open";

async function openApple() {
  const view = openTask("chat-apple");
  const image = await screen.findByRole("button", { name: "Open A red apple on a white table" });
  await view.user.click(image);
  await waitFor(() => expect(isOpen()).toBe(true));
  return { ...view, image };
}

describe("the artifact panel", () => {
  it("is hidden until something opens it", async () => {
    openTask("chat-apple");
    await screen.findByRole("button", { name: "Open A red apple on a white table" });
    expect(isOpen()).toBe(false);
    expect(panel()).toHaveAttribute("aria-hidden", "true");
    expect(panel()).toHaveAttribute("inert");
  });

  it("opens on an image click, with the picture and its details", async () => {
    await openApple();
    const p = within(panel());
    expect(p.getByRole("heading", { name: "Image Preview" })).toBeInTheDocument();
    expect(p.getByRole("img", { name: "A red apple on a white table" })).toHaveAttribute("src", "/mock/red-apple.svg");
    expect(p.getByText(/A single fresh red apple/)).toBeInTheDocument();
    expect(p.getByText("GPT Image 2")).toBeInTheDocument();
    expect(p.getByText("1024 X 1024")).toBeInTheDocument();
    expect(p.getByText("Generated in chat")).toBeInTheDocument();
    expect(p.getByText(/^\d{1,2}-[A-Z][a-z]+-\d{4}$/)).toBeInTheDocument();
    expect(panel()).not.toHaveAttribute("aria-hidden", "true");
  });

  it("opens from the keyboard too", async () => {
    const view = openTask("chat-apple");
    const image = await screen.findByRole("button", { name: "Open A red apple on a white table" });
    image.focus();
    await view.user.keyboard("{Enter}");
    await waitFor(() => expect(isOpen()).toBe(true));
  });

  it("moves focus to its close button, and back to the picture when closed", async () => {
    const { user, image } = await openApple();
    expect(within(panel()).getByRole("button", { name: "Close preview" })).toHaveFocus();
    await user.click(within(panel()).getByRole("button", { name: "Close preview" }));
    await waitFor(() => expect(isOpen()).toBe(false));
    expect(image).toHaveFocus();
  });

  it("closes with Escape", async () => {
    const { user } = await openApple();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(isOpen()).toBe(false));
  });

  it("copies the prompt and the link", async () => {
    const { user } = await openApple();
    const p = within(panel());
    await user.click(p.getByRole("button", { name: "Copy" }));
    expect(await navigator.clipboard.readText()).toMatch(/^A single fresh red apple/);
    await user.click(p.getByRole("button", { name: "Copy Link" }));
    expect(await navigator.clipboard.readText()).toBe(new URL("/mock/red-apple.svg", window.location.href).href);
    expect(p.getByRole("link", { name: "Download" })).toHaveAttribute("href", "/mock/red-apple.svg");
  });

  it("shows a video with controls", () => {
    useChatStore.getState().openArtifactPanel({
      chatId: "chat-apple",
      asset: { type: "video", url: "https://cdn.example.com/clip.mp4", altText: "A clip", width: 1280, height: 720 },
      createdAt: null,
      openedBy: "stream",
    });
    navigation.params = { chatId: "chat-apple" };
    renderApp(<ArtifactPanel />);
    const video = within(panel()).getByLabelText("A clip");
    expect(video.tagName).toBe("VIDEO");
    expect(video).toHaveAttribute("controls");
    expect(within(panel()).getByRole("heading", { name: "Video Preview" })).toBeInTheDocument();
  });

  it("won't load or link an address that isn't a web address", () => {
    useChatStore.getState().openArtifactPanel({
      chatId: "chat-apple",
      asset: { type: "image", url: "javascript:alert(1)", altText: "Bad" },
      createdAt: null,
      openedBy: "stream",
    });
    navigation.params = { chatId: "chat-apple" };
    renderApp(<ArtifactPanel />);
    const p = within(panel());
    expect(p.getByText("Image unavailable")).toBeInTheDocument();
    expect(p.queryByRole("link", { name: "Download" })).not.toBeInTheDocument();
    expect(p.getByRole("button", { name: "Copy Link" })).toBeDisabled();
  });

  it("closes when you move to another task, and stays for its own", async () => {
    const { rerender, user } = await openApple();
    // the same task re-rendering keeps it open
    rerender(
      <>
        <ChatWindow key="chat-apple" chatId="chat-apple" />
        <ArtifactPanel />
      </>,
    );
    expect(isOpen()).toBe(true);

    navigation.params = { chatId: "chat-greeting" };
    rerender(
      <>
        <ChatWindow key="chat-greeting" chatId="chat-greeting" />
        <ArtifactPanel />
      </>,
    );
    await waitFor(() => expect(isOpen()).toBe(false));
    void user;
  });
});

describe("a picture made during a reply", () => {
  it("opens the panel by itself, without taking focus from the composer", async () => {
    const { user } = openTask("chat-greeting");
    await screen.findByText("Hi! What can I help you with today?");
    const box = screen.getByPlaceholderText("Send a message…");
    await typeAndSend(user, box, "draw a cat");
    await waitFor(() => expect(realtime.subscriptions.length).toBeGreaterThan(0));
    box.focus();

    realtime.push({ type: "asset", asset: { type: "image", url: "/mock/cat.png", altText: "A cat", prompt: "a cat", width: 512, height: 512 } });
    await waitFor(() => expect(isOpen()).toBe(true));
    expect(within(panel()).getByRole("img", { name: "A cat" })).toBeInTheDocument();
    expect(box).toHaveFocus();
    expect(useChatStore.getState().artifactPanel.artifact).toMatchObject({ chatId: "chat-greeting", openedBy: "stream" });
  });

  it("doesn't reopen after you close it while the reply goes on", async () => {
    const { user } = openTask("chat-greeting");
    await screen.findByText("Hi! What can I help you with today?");
    await typeAndSend(user, screen.getByPlaceholderText("Send a message…"), "draw a cat");
    await waitFor(() => expect(realtime.subscriptions.length).toBeGreaterThan(0));
    realtime.push({ type: "asset", asset: { type: "image", url: "/mock/cat.png", altText: "A cat" } });
    await waitFor(() => expect(isOpen()).toBe(true));
    useChatStore.getState().closeArtifactPanel();
    realtime.push({ type: "text-delta", delta: "Here is your cat." });
    await screen.findByText("Here is your cat.");
    expect(isOpen()).toBe(false);
  });
});

describe("a video in the conversation", () => {
  it("opens in the panel from its corner button", async () => {
    const db = getMockDb();
    db.messages["chat-greeting"].push({
      id: "m-vid", chatId: "chat-greeting", role: "ASSISTANT", content: "", status: "COMPLETED", createdAt: new Date().toISOString(), agentRunId: null,
      contentBlocks: [{ type: "video", url: "https://cdn.example.com/clip.mp4", altText: "Waves", width: 1280, height: 720 }],
    });
    const { user } = openTask("chat-greeting");
    await user.click(await screen.findByRole("button", { name: "Open Waves" }));
    await waitFor(() => expect(isOpen()).toBe(true));
    expect(within(panel()).getByLabelText("Waves").tagName).toBe("VIDEO");
  });
});

describe("in mock mode, a reply with a picture", () => {
  it("opens the panel when the picture shows up in the saved progress (the polling path)", async () => {
    const { vi } = await import("vitest");
    const { RUN_MS } = await import("../mocks/handlers");
    const { user } = openTask("chat-greeting");
    await screen.findByText("Hi! What can I help you with today?");
    await typeAndSend(user, screen.getByPlaceholderText("Send a message…"), "draw an image of an apple");
    await waitFor(() => expect(useChatStore.getState().runs["chat-greeting"]).toBeDefined());
    realtime.failStream(); // no live stream: the page follows the server's saved progress
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + RUN_MS * 0.85);
    await waitFor(() => expect(isOpen()).toBe(true), { timeout: 4000 });
    vi.useRealTimers();
    expect(within(panel()).getByRole("img", { name: "A red apple" })).toBeInTheDocument();
  });
});

describe("a picture that lands right as the run ends", () => {
  it("still opens the panel, from the saved reply", async () => {
    const { vi } = await import("vitest");
    const { RUN_MS } = await import("../mocks/handlers");
    const { user } = openTask("chat-greeting");
    await screen.findByText("Hi! What can I help you with today?");
    await typeAndSend(user, screen.getByPlaceholderText("Send a message…"), "draw a picture please");
    await waitFor(() => expect(useChatStore.getState().runs["chat-greeting"]).toBeDefined());
    // no progress check ever sees the picture: the next one already finds the run over
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + RUN_MS + 500);
    realtime.setRun({ status: "COMPLETED" });
    await waitFor(() => expect(useChatStore.getState().runs["chat-greeting"]).toBeUndefined());
    vi.useRealTimers();
    expect(isOpen()).toBe(true);
    expect(useChatStore.getState().artifactPanel.artifact).toMatchObject({ chatId: "chat-greeting", openedBy: "stream", asset: { url: "/mock/red-apple.svg" } });
  });

  it("doesn't open for an old reply's picture when the task is opened later", async () => {
    openTask("chat-apple");
    await screen.findByRole("button", { name: "Open A red apple on a white table" });
    await new Promise((r) => setTimeout(r, 100));
    expect(isOpen()).toBe(false);
  });
});

describe("edge cases", () => {
  it("on a phone, a new picture doesn't cover the screen by itself", async () => {
    const { setViewport } = await import("../setup");
    setViewport(false);
    const { user } = openTask("chat-greeting");
    await screen.findByText("Hi! What can I help you with today?");
    await typeAndSend(user, screen.getByPlaceholderText("Send a message…"), "draw a cat");
    await waitFor(() => expect(realtime.subscriptions.length).toBeGreaterThan(0));
    realtime.push({ type: "asset", asset: { type: "image", url: "/mock/cat.png", altText: "A cat" } });
    realtime.push({ type: "text-delta", delta: "Here it is" });
    await screen.findByText("Here it is");
    expect(isOpen()).toBe(false);
  });

  it("on a phone, the open panel is a dialog that keeps Tab inside it", async () => {
    const { setViewport } = await import("../setup");
    setViewport(false);
    const { user } = await openApple();
    expect(panel()).toHaveAttribute("role", "dialog");
    expect(panel()).toHaveAttribute("aria-modal", "true");
    for (let i = 0; i < 8; i++) {
      await user.tab();
      expect(panel().contains(document.activeElement)).toBe(true);
    }
    await user.tab({ shift: true });
    expect(panel().contains(document.activeElement)).toBe(true);
  });

  it("on a wide screen it is a side panel, not a dialog", async () => {
    await openApple();
    expect(panel()).not.toHaveAttribute("role");
    expect(panel()).not.toHaveAttribute("aria-modal");
  });

  it("closing a panel that opened by itself puts focus in the message box", async () => {
    const { user } = openTask("chat-greeting");
    await screen.findByText("Hi! What can I help you with today?");
    const box = screen.getByPlaceholderText("Send a message…");
    await typeAndSend(user, box, "draw a cat");
    await waitFor(() => expect(realtime.subscriptions.length).toBeGreaterThan(0));
    realtime.push({ type: "asset", asset: { type: "image", url: "/mock/cat.png", altText: "A cat" } });
    await waitFor(() => expect(isOpen()).toBe(true));
    await user.click(within(panel()).getByRole("button", { name: "Close preview" }));
    await waitFor(() => expect(isOpen()).toBe(false));
    expect(box).toHaveFocus();
  });

  it("Escape in a confirmation dialog doesn't also close the panel", async () => {
    const { user } = await openApple();
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "alertdialog");
    const button = document.createElement("button");
    dialog.append(button);
    document.body.append(dialog);
    button.focus();
    await user.keyboard("{Escape}");
    expect(isOpen()).toBe(true);
    dialog.remove();
  });

  it("shows a long model name in full on hover", () => {
    const model = "a-very-long-model-name-that-will-not-fit-in-the-row-at-all-v2";
    useChatStore.getState().openArtifactPanel({ chatId: "chat-apple", asset: { type: "image", url: "/a.png", model }, createdAt: null, openedBy: "stream" });
    navigation.params = { chatId: "chat-apple" };
    renderApp(<ArtifactPanel />);
    expect(within(panel()).getByText(model)).toHaveAttribute("title", model);
  });

  it("keeps a sensible shape when the size is missing or nonsense", () => {
    useChatStore.getState().openArtifactPanel({
      chatId: "chat-apple",
      asset: { type: "image", url: "/a.png", altText: "Odd", width: 0, height: -5 },
      createdAt: null,
      openedBy: "stream",
    });
    navigation.params = { chatId: "chat-apple" };
    renderApp(<ArtifactPanel />);
    expect(within(panel()).getByRole("img", { name: "Odd" }).style.aspectRatio).toMatch(/^1( \/ 1)?$/);
    expect(within(panel()).queryByText(/ X /)).not.toBeInTheDocument();
  });
});

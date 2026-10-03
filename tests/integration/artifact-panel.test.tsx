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
  // laid out like the app shell: the conversation in <main>, the preview dialog mounted beside it
  return renderApp(
    <>
      <main>
        <ChatWindow key={chatId} chatId={chatId} />
      </main>
      <ArtifactPanel />
    </>,
  );
}

const preview = () => screen.queryByRole("dialog");

async function openApple() {
  const view = openTask("chat-apple");
  const image = await screen.findByRole("button", { name: "Open A red apple on a white table" });
  await view.user.click(image);
  const dialog = await screen.findByRole("dialog", { name: "Image Preview" });
  return { ...view, image, dialog };
}

type Opening = Parameters<ReturnType<typeof useChatStore.getState>["openArtifactPanel"]>[0];

function openDirectly(asset: Opening["asset"], extra: Partial<Opening> = {}) {
  useChatStore.getState().openArtifactPanel({ chatId: "chat-apple", asset, createdAt: "2026-10-01T10:00:00Z", openedBy: "user", ...extra });
  navigation.params = { chatId: "chat-apple" };
  return renderApp(<ArtifactPanel />);
}

describe("the image preview (magica's centered dialog)", () => {
  it("isn't there until a picture is clicked", async () => {
    openTask("chat-apple");
    await screen.findByRole("button", { name: "Open A red apple on a white table" });
    expect(preview()).not.toBeInTheDocument();
  });

  it("opens on a picture click, with the picture and its details", async () => {
    const { dialog } = await openApple();
    const d = within(dialog);
    expect(d.getByRole("img", { name: "A red apple on a white table" })).toHaveAttribute("src", "/mock/red-apple.svg");
    expect(d.getByText(/A single fresh red apple/)).toBeInTheDocument();
    expect(d.getByText("GPT Image 2")).toBeInTheDocument();
    expect(d.getByText("1024 X 1024")).toBeInTheDocument();
    expect(d.getByText("Generated in chat")).toBeInTheDocument();
    // magica's date: a two-digit day
    expect(d.getByText(/^\d{2}-[A-Z][a-z]+-\d{4}$/)).toBeInTheDocument();
    expect(d.getByRole("button", { name: "Use as reference" })).toHaveAttribute("aria-disabled", "true");
  });

  it("opens from the keyboard too", async () => {
    const view = openTask("chat-apple");
    const image = await screen.findByRole("button", { name: "Open A red apple on a white table" });
    image.focus();
    await view.user.keyboard("{Enter}");
    expect(await screen.findByRole("dialog", { name: "Image Preview" })).toBeInTheDocument();
  });

  it("closes with its close button and gives focus back to the picture", async () => {
    const { user, image, dialog } = await openApple();
    await user.click(within(dialog).getByRole("button", { name: "Close preview" }));
    await waitFor(() => expect(preview()).not.toBeInTheDocument());
    expect(image).toHaveFocus();
  });

  it("closes with Escape", async () => {
    const { user } = await openApple();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(preview()).not.toBeInTheDocument());
  });

  it("keeps Tab inside while open", async () => {
    const { user, dialog } = await openApple();
    for (let i = 0; i < 8; i++) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it("copies the prompt and the link, and downloads", async () => {
    const { user, dialog } = await openApple();
    const d = within(dialog);
    await user.click(d.getByRole("button", { name: "Copy prompt" }));
    expect(await navigator.clipboard.readText()).toMatch(/^A single fresh red apple/);
    await user.click(d.getByRole("button", { name: "Copy Link" }));
    expect(await navigator.clipboard.readText()).toBe(new URL("/mock/red-apple.svg", window.location.href).href);
    expect(d.getByRole("link", { name: "Download" })).toHaveAttribute("href", "/mock/red-apple.svg");
  });

  it("shows a video with controls, titled Video Preview", () => {
    openDirectly({ type: "video", url: "https://cdn.example.com/clip.mp4", altText: "A clip", width: 1280, height: 720 });
    const dialog = screen.getByRole("dialog", { name: "Video Preview" });
    const video = within(dialog).getByLabelText("A clip");
    expect(video.tagName).toBe("VIDEO");
    expect(video).toHaveAttribute("controls");
  });

  it("won't load or link an address that isn't a web address", () => {
    openDirectly({ type: "image", url: "javascript:alert(1)", altText: "Bad" });
    const d = within(screen.getByRole("dialog"));
    expect(d.getByText("Image unavailable")).toBeInTheDocument();
    expect(d.queryByRole("link", { name: "Download" })).not.toBeInTheDocument();
    expect(d.getByRole("button", { name: "Copy Link" })).toBeDisabled();
  });

  it("shows a long model name in full on hover", () => {
    const model = "a-very-long-model-name-that-will-not-fit-in-the-row-at-all-v2";
    openDirectly({ type: "image", url: "/a.png", model });
    expect(within(screen.getByRole("dialog")).getByText(model)).toHaveAttribute("title", model);
  });

  it("closes when you move to another task", async () => {
    const { rerender } = await openApple();
    navigation.params = { chatId: "chat-greeting" };
    rerender(
      <>
        <main>
          <ChatWindow key="chat-greeting" chatId="chat-greeting" />
        </main>
        <ArtifactPanel />
      </>,
    );
    await waitFor(() => expect(preview()).not.toBeInTheDocument());
  });
});

describe("never opening by itself (as on magica)", () => {
  it("a picture made during a reply stays in the reply", async () => {
    const { user } = openTask("chat-greeting");
    await screen.findByText("Hi! What can I help you with today?");
    await typeAndSend(user, screen.getByPlaceholderText("Send a message…"), "draw a cat");
    await waitFor(() => expect(realtime.subscriptions.length).toBeGreaterThan(0));
    realtime.push(
      { type: "asset", asset: { type: "image", url: "/mock/cat.png", altText: "A cat", prompt: "a cat", width: 512, height: 512 } },
      { type: "text-delta", delta: "Here is your cat." },
    );
    expect(await screen.findByRole("img", { name: "A cat" })).toBeInTheDocument();
    expect(preview()).not.toBeInTheDocument();
  });

  it("a finished reply with a picture doesn't open it either", async () => {
    openTask("chat-apple");
    await screen.findByRole("button", { name: "Open A red apple on a white table" });
    await new Promise((r) => setTimeout(r, 100));
    expect(preview()).not.toBeInTheDocument();
  });
});

describe("a video in the conversation", () => {
  it("opens in the preview from its corner button", async () => {
    getMockDb().messages["chat-greeting"].push({
      id: "m-vid", chatId: "chat-greeting", role: "ASSISTANT", content: "", status: "COMPLETED", createdAt: new Date().toISOString(), agentRunId: null,
      contentBlocks: [{ type: "video", url: "https://cdn.example.com/clip.mp4", altText: "Waves", width: 1280, height: 720 }],
    });
    const { user } = openTask("chat-greeting");
    await user.click(await screen.findByRole("button", { name: "Open Waves" }));
    const dialog = await screen.findByRole("dialog", { name: "Video Preview" });
    expect(within(dialog).getByLabelText("Waves").tagName).toBe("VIDEO");
  });
});

describe("where a file came from", () => {
  it("says a file the user uploaded was uploaded, and shows its name", () => {
    openDirectly({ type: "image", url: "/mock/beach.jpg", altText: "beach.jpg", width: 800, height: 600 }, { source: "upload", name: "beach.jpg" });
    const d = within(screen.getByRole("dialog"));
    expect(d.getByText("Uploaded")).toBeInTheDocument();
    expect(d.queryByText("Generated in chat")).not.toBeInTheDocument();
    // its name, without the extension, as magica shows it
    expect(d.getByText("File Name")).toBeInTheDocument();
    expect(d.getByText("beach")).toHaveAttribute("title", "beach.jpg");
  });

  it("says a generated picture was generated in the chat, with no file name", () => {
    openDirectly({ type: "image", url: "/mock/red-apple.svg", prompt: "A red apple" }, { source: "generated", name: null });
    const d = within(screen.getByRole("dialog"));
    expect(d.getByText("Generated in chat")).toBeInTheDocument();
    expect(d.queryByText("File Name")).not.toBeInTheDocument();
  });

  it("opens an uploaded file from a message as uploaded", async () => {
    getMockDb().messages["chat-apple"][0].attachments = [
      { ...getMockDb().media.find((m) => m.id === "media-beach")!, expired: false },
    ];
    const { user } = openTask("chat-apple");
    await user.click(await screen.findByRole("button", { name: "Open beach.jpg" }));
    const dialog = await screen.findByRole("dialog", { name: "Image Preview" });
    expect(within(dialog).getByText("Uploaded")).toBeInTheDocument();
  });
});

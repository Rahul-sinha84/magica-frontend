import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Message } from "@/components/chat/Message";
import { fileNameFor } from "@/lib/download";
import type { ContentBlock, Message as MessageData } from "@/types";

const reply = (blocks: ContentBlock[], over: Partial<MessageData> = {}): MessageData => ({
  id: "m1", chatId: "c1", role: "ASSISTANT", content: "", contentBlocks: blocks, status: "COMPLETED",
  createdAt: "2026-10-03T10:00:00Z", agentRunId: null, ...over,
});
const image = (url: string): ContentBlock => ({ type: "image", url, width: 1024, height: 1024 });
const video = (url: string): ContentBlock => ({ type: "video", url, mimeType: "video/mp4", width: 640, height: 360 });

// what was saved: each link's address and the name it was saved under
function downloads() {
  const saved: { href: string; download: string; target: string }[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    saved.push({ href: this.href, download: this.download, target: this.target });
  });
  return saved;
}

afterEach(() => vi.restoreAllMocks());

describe("Download all", () => {
  it("shows under a reply with two or more pictures or videos, above the credits line", () => {
    render(<Message message={reply([image("https://cdn.example.com/a.png"), video("https://cdn.example.com/b.mp4"), { type: "usage", creditCost: 1_200_000 } as ContentBlock])} />);
    const button = screen.getByRole("button", { name: "Download all 2 generated assets" });
    expect(button).toHaveTextContent("Download all");
    const credits = screen.getByText(/1\.2M credits/);
    expect(button.compareDocumentPosition(credits) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("isn't there for a single picture, the same picture twice, or audio", () => {
    render(
      <Message
        message={reply([
          image("https://cdn.example.com/a.png"),
          image("https://cdn.example.com/a.png"),
          { type: "audio", url: "https://cdn.example.com/c.mp3" } as ContentBlock,
        ])}
      />,
    );
    expect(screen.queryByRole("button", { name: /Download all/ })).not.toBeInTheDocument();
  });

  it("saves each file under its own name, one after another", async () => {
    const saved = downloads();
    const fetched: string[] = [];
    vi.spyOn(window, "fetch").mockImplementation(async (input) => {
      fetched.push(String(input));
      return new Response(new Blob(["x"], { type: "image/png" }));
    });
    render(<Message message={reply([image("https://cdn.example.com/gen/fox.png"), image("https://cdn.example.com/gen/fox-cropped.webp")])} />);
    await userEvent.click(screen.getByRole("button", { name: /Download all/ }));
    await waitFor(() => expect(saved).toHaveLength(2));
    expect(fetched).toEqual(["https://cdn.example.com/gen/fox.png", "https://cdn.example.com/gen/fox-cropped.webp"]);
    expect(saved.map((file) => file.download)).toEqual(["fox.png", "fox-cropped.webp"]);
    // saved from the fetched copy, not by following the link
    expect(saved.every((file) => file.href.startsWith("blob:"))).toBe(true);
  });

  it("hands a file the page can't fetch (no CORS) to the browser instead", async () => {
    const saved = downloads();
    vi.spyOn(window, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    render(<Message message={reply([image("https://cdn.example.com/a.png"), image("https://cdn.example.com/b.png")])} />);
    await userEvent.click(screen.getByRole("button", { name: /Download all/ }));
    await waitFor(() => expect(saved).toHaveLength(2));
    expect(saved[0]).toEqual({ href: "https://cdn.example.com/a.png", download: "a.png", target: "_blank" });
  });

  it("isn't shown while the reply is still being written", () => {
    render(<Message message={reply([image("https://cdn.example.com/a.png"), image("https://cdn.example.com/b.png")], { status: "STREAMING" })} />);
    expect(screen.queryByRole("button", { name: /Download all/ })).not.toBeInTheDocument();
  });
});

describe("the name a file is saved under", () => {
  it("is its address's file name, or a made-up one with the right extension", () => {
    expect(fileNameFor("https://cdn.example.com/gen/abc123.png?sig=1", 0)).toBe("abc123.png");
    expect(fileNameFor("https://cdn.example.com/out/abc123", 1, "image/jpeg")).toBe("magica-2.jpg");
    expect(fileNameFor("https://cdn.example.com/out/clip", 0, "video/mp4")).toBe("magica-1.mp4");
    expect(fileNameFor("/mock/red-apple.svg", 0)).toBe("red-apple.svg");
  });
});

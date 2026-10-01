import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Message } from "@/components/chat/Message";
import { MessageContent } from "@/components/chat/MessageContent";
import { useChatStore } from "@/stores/chatStore";
import type { ContentBlock, Message as MessageData, ToolCallBlock } from "@/types";

const call = (id: string, over: Partial<ToolCallBlock> = {}): ToolCallBlock => ({
  type: "tool_call", toolCallId: id, toolName: "skill", toolInput: { name: id }, status: "completed", durationMs: 1700, ...over,
});
const view = (blocks: ContentBlock[]) => render(<MessageContent blocks={blocks} chatId="c1" />);

describe("message content", () => {
  it("renders text as markdown", () => {
    view([{ type: "text", content: "Some **bold** words and a [link](https://example.com)" }]);
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    const link = screen.getByRole("link", { name: "link" });
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("does not turn a javascript: link into something clickable", () => {
    view([{ type: "text", content: "[click](javascript:alert(1))" }]);
    const link = screen.queryByRole("link", { name: "click" });
    expect(link?.getAttribute("href") ?? "").not.toMatch(/^javascript:/i);
  });

  it("shows markdown images as links, so nothing is fetched behind your back", () => {
    view([{ type: "text", content: "![tracker](https://evil.example/pixel.png)" }]);
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByRole("link")).toHaveAttribute("href", "https://evil.example/pixel.png");
  });

  it("shows a picture the reply made where its text puts it, once, between the paragraphs (magica)", () => {
    const url = "https://cdn.example.com/cup.png";
    view([
      { type: "image", url, altText: "A blue cup", width: 1024, height: 1024 },
      { type: "text", content: `Here's your image:\n\n![cup](${url})\n\nA simple blue cup.` },
    ]);
    const pictures = screen.getAllByRole("img", { name: "A blue cup" });
    expect(pictures).toHaveLength(1);
    const before = screen.getByText("Here's your image:");
    const after = screen.getByText("A simple blue cup.");
    expect(before.compareDocumentPosition(pictures[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(pictures[0].compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // no picture inside a paragraph
    expect(pictures[0].closest("p")).toBeNull();
    expect(screen.getByRole("button", { name: "Open A blue cup" })).toBeInTheDocument();
  });

  it("still shows any other image address in the text as a link", () => {
    view([
      { type: "image", url: "https://cdn.example.com/cup.png", altText: "A blue cup" },
      { type: "text", content: "![tracker](https://evil.example/pixel.png?d=secret)" },
    ]);
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "tracker" })).toHaveAttribute("href", "https://evil.example/pixel.png?d=secret");
  });

  it("shows an image, and opens it in the panel on click", async () => {
    view([{ type: "image", url: "/mock/red-apple.svg", altText: "A red apple", width: 100, height: 50 }]);
    expect(screen.getByRole("img", { name: "A red apple" })).toHaveAttribute("src", "/mock/red-apple.svg");
    await userEvent.setup().click(screen.getByRole("button", { name: "Open A red apple" }));
    expect(useChatStore.getState().artifactPanel).toMatchObject({ isOpen: true, artifact: { chatId: "c1", asset: { url: "/mock/red-apple.svg", type: "image" }, openedBy: "user" } });
  });

  it("says so when an image fails to load", () => {
    view([{ type: "image", url: "/nope.png", altText: "Gone" }]);
    screen.getByRole("img", { name: "Gone" }).dispatchEvent(new Event("error"));
    return screen.findByText("Image unavailable");
  });

  it("renders a video with controls", () => {
    view([{ type: "video", url: "/clip.mp4", altText: "A clip" }]);
    expect(screen.getByLabelText("A clip")).toHaveAttribute("controls");
  });

  it("shows a source as a link with its title or host", () => {
    view([
      { type: "citation", url: "https://example.com/a", title: "Example article" },
      { type: "citation", url: "https://news.example.org/b" },
    ]);
    expect(screen.getByRole("link", { name: "Example article" })).toHaveAttribute("href", "https://example.com/a");
    expect(screen.getByRole("link", { name: "news.example.org" })).toBeInTheDocument();
  });

  it("does not link a source that isn't a web address", () => {
    view([{ type: "citation", url: "javascript:alert(1)", title: "Sneaky" }]);
    expect(screen.queryByRole("link", { name: "Sneaky" })).not.toBeInTheDocument();
    expect(screen.getByText("Sneaky")).toBeInTheDocument();
  });

  it("never shows thinking in a reply (magica shows it only live)", () => {
    const { container } = view([{ type: "thinking", content: "Let me work this out", durationMs: 2300 }, { type: "text", content: "Answer." }]);
    expect(screen.queryByText("Let me work this out")).not.toBeInTheDocument();
    expect(screen.queryByText(/Thought for|Thinking/)).not.toBeInTheDocument();
    expect(container).toHaveTextContent("Answer.");
  });

  it("hides usage blocks, which only feed the credits line", () => {
    const { container } = view([{ type: "usage", creditCost: 10 } as ContentBlock, { type: "text", content: "hi" }]);
    expect(container).toHaveTextContent("hi");
    expect(container).not.toHaveTextContent("10");
  });
});

describe("steps", () => {
  it("counts steps and says Completed when they are done", () => {
    view([call("a"), call("b"), call("c")]);
    expect(screen.getByRole("button", { name: /Completed 3 steps/ })).toBeInTheDocument();
  });

  it("says Working while a step is running, and opens itself", () => {
    view([call("a"), call("b", { status: "running", durationMs: undefined })]);
    const trigger = screen.getByRole("button", { name: /Working · 2 steps/ });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("is closed once completed, and opens on click", async () => {
    view([call("only")]);
    expect(screen.getByRole("button", { name: /Completed 1 step$/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("1.7s")).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: /Completed 1 step$/ }));
    expect(screen.getByText("1.7s")).toBeInTheDocument();
  });

  it("counts failed steps", () => {
    view([call("a"), call("b", { status: "failed" })]);
    expect(screen.getByRole("button", { name: /Completed 2 steps.*1 failed/ })).toBeInTheDocument();
  });

  it("pairs a tool_result with its call and shows the input table", async () => {
    const user = userEvent.setup();
    view([
      call("gen", { toolName: "ai_generation", toolInput: { model: "m1", prompt: "a red apple" }, creditCost: 70_000 }),
      { type: "tool_result", toolCallId: "gen", toolName: "ai_generation", result: { url: "/out.png" }, isError: false },
    ]);
    // the result is not a step of its own
    expect(screen.getByRole("button", { name: /Completed 1 step$/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Completed 1 step$/ }));
    expect(screen.getByText("a red apple")).toBeInTheDocument();
    expect(screen.getByText("Credits used")).toBeInTheDocument();
  });
});

const message = (over: Partial<MessageData>): MessageData => ({
  id: "m1", chatId: "c1", role: "ASSISTANT", content: "", contentBlocks: [], status: "COMPLETED",
  createdAt: "2026-01-01T14:42:00Z", agentRunId: null, ...over,
});

describe("message", () => {
  it("shows a user's message as a pill with its text", () => {
    render(<Message message={message({ role: "USER", content: "hello there" })} pending={false} />);
    expect(screen.getByText("hello there")).toBeInTheDocument();
  });

  it("hides the actions on a message that is still being sent", () => {
    render(<Message message={message({ role: "USER", content: "hi" })} pending />);
    expect(screen.queryByRole("button", { name: "Copy" })).not.toBeInTheDocument();
  });

  it("shows the credits used under a reply", () => {
    render(<Message message={message({ contentBlocks: [{ type: "text", content: "done" }, { type: "usage", creditCost: 290_000 } as ContentBlock] })} pending={false} />);
    expect(screen.getByText("0.29M credits")).toBeInTheDocument();
  });

  it("falls back to the plain content when there are no blocks", () => {
    render(<Message message={message({ content: "plain reply" })} pending={false} />);
    expect(screen.getByText("plain reply")).toBeInTheDocument();
  });

  it("notes a failed or stopped reply", () => {
    const { rerender } = render(<Message message={message({ status: "FAILED", content: "partial" })} pending={false} />);
    expect(within(document.body).getByRole("alert")).toBeInTheDocument();
    rerender(<Message message={message({ status: "CANCELLED", content: "partial" })} pending={false} />);
    expect(screen.getByText("Response was interrupted")).toBeInTheDocument();
  });

  it("shows the reason a reply failed", () => {
    render(<Message message={message({ status: "FAILED", content: "partial", errorMessage: "The model ran out of credits." })} pending={false} />);
    expect(screen.getByRole("alert")).toHaveTextContent("The model ran out of credits.");
    expect(screen.queryByText("Something went wrong while writing this response.")).not.toBeInTheDocument();
  });

  it("falls back to the general wording when there is no reason", () => {
    for (const errorMessage of [null, undefined, ""]) {
      const { unmount } = render(<Message message={message({ status: "FAILED", errorMessage })} pending={false} />);
      expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong while writing this response.");
      unmount();
    }
  });

  it("only shows a reason on a failed reply", () => {
    render(<Message message={message({ status: "COMPLETED", content: "fine", errorMessage: "stale reason" })} pending={false} />);
    expect(screen.queryByText("stale reason")).not.toBeInTheDocument();
  });

  it("copies a reply's text", async () => {
    const user = userEvent.setup();
    render(<Message message={message({ contentBlocks: [{ type: "text", content: "copy me" }] })} pending={false} />);
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(await navigator.clipboard.readText()).toBe("copy me");
  });
});

describe("an empty reply", () => {
  it("says there was no response instead of showing only buttons", () => {
    render(<Message message={message({ status: "COMPLETED", content: "", contentBlocks: [] })} pending={false} />);
    expect(screen.getByText("No response.")).toBeInTheDocument();
  });
});

describe("audio", () => {
  it("plays inline with a labelled native player and its length", () => {
    render(<MessageContent blocks={[{ type: "audio", url: "/mock/chime.wav", altText: "A short chime", durationMs: 65_000 }]} chatId="c1" />);
    const player = screen.getByLabelText("A short chime");
    expect(player.tagName).toBe("AUDIO");
    expect(player).toHaveAttribute("controls");
    expect(player).toHaveAttribute("src", "/mock/chime.wav");
    expect(screen.getByText("1:05")).toBeInTheDocument();
  });

  it("falls back to 'Generated audio' without alt text, and shows no length when unknown", () => {
    render(<MessageContent blocks={[{ type: "audio", url: "/a.mp3" }]} chatId="c1" />);
    expect(screen.getByLabelText("Generated audio").tagName).toBe("AUDIO");
    expect(screen.queryByText(/^\d+:\d\d$/)).not.toBeInTheDocument();
  });

  it("won't load an address that isn't a web address", () => {
    render(<MessageContent blocks={[{ type: "audio", url: "javascript:alert(1)" }]} chatId="c1" />);
    expect(screen.getByText("Audio unavailable")).toBeInTheDocument();
    expect(document.querySelector("audio")).toBeNull();
  });
});

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MessageContent } from "@/components/chat/MessageContent";
import type { ContentBlock, ToolCallBlock } from "@/types";

const follows = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
const step = (id: string, toolName: string): ToolCallBlock => ({ type: "tool_call", toolCallId: id, toolName, toolInput: { name: "image-generation" }, status: "completed" });

describe("media placement, as magica lays it out", () => {
  it("puts a tool's picture below the reply text, even though it was streamed first", () => {
    // the real backend's order: steps, the image (on the tool's end), then the model's answer
    render(
      <MessageContent
        chatId="c1"
        blocks={[
          { type: "thinking", content: "Load the skill", durationMs: 2000 },
          step("s1-a", "load_skill"),
          step("s2-b", "gpt_image_2"),
          { type: "image", url: "https://cdn.example.com/apple.png", altText: "An apple", model: "GPT Image 2" },
          { type: "thinking", content: "Tell the user" },
          { type: "text", content: "Here's your apple." },
        ]}
      />,
    );
    const text = screen.getByText("Here's your apple.");
    const image = screen.getByRole("img", { name: "An apple" });
    expect(follows(text, image)).toBe(true);
    // one thinking row and one steps group above both
    expect(follows(screen.getByRole("button", { name: /Completed 2 steps/ }), text)).toBe(true);
  });

  it("shows several pictures and videos side by side in one media row", () => {
    const { container } = render(
      <MessageContent
        chatId="c1"
        blocks={[
          { type: "image", url: "https://cdn.example.com/1.png", altText: "One" },
          { type: "text", content: "Two pictures and a clip." },
          { type: "image", url: "https://cdn.example.com/2.png", altText: "Two" },
          { type: "video", url: "https://cdn.example.com/c.mp4", altText: "Clip" },
        ]}
      />,
    );
    const row = screen.getByRole("img", { name: "One" }).closest(".flex-wrap")!;
    expect(row).toBe(screen.getByRole("img", { name: "Two" }).closest(".flex-wrap"));
    expect(within(row as HTMLElement).getByLabelText("Clip").tagName).toBe("VIDEO");
    expect(follows(screen.getByText("Two pictures and a clip."), row)).toBe(true);
    // the row is the last thing in the reply
    expect(container.firstElementChild!.lastElementChild).toBe(row);
  });

  it("places audio after the pictures", () => {
    render(
      <MessageContent
        chatId="c1"
        blocks={[
          { type: "audio", url: "/mock/chime.wav", altText: "A chime" },
          { type: "image", url: "https://cdn.example.com/1.png", altText: "One" },
          { type: "text", content: "Sound and picture." },
        ]}
      />,
    );
    expect(follows(screen.getByText("Sound and picture."), screen.getByRole("img", { name: "One" }))).toBe(true);
    expect(follows(screen.getByRole("img", { name: "One" }), screen.getByLabelText("A chime"))).toBe(true);
  });

  it("sits 4px under the steps when the reply has no text (magica's spacing)", () => {
    render(<MessageContent chatId="c1" blocks={[step("s1-a", "gpt_image_2"), { type: "image", url: "https://cdn.example.com/1.png", altText: "One" }]} />);
    expect(screen.getByRole("img", { name: "One" }).closest(".flex-wrap")).toHaveClass("mt-1");
  });

  it("is 16px under the text", () => {
    render(<MessageContent chatId="c1" blocks={[{ type: "text", content: "Hi" }, { type: "image", url: "https://cdn.example.com/1.png", altText: "One" }]} />);
    expect(screen.getByRole("img", { name: "One" }).closest(".flex-wrap")).toHaveClass("mt-4");
  });
});

describe("the picture's corner actions (magica's)", () => {
  it("offers Download (a real link) and 'Use as reference' (not in this build)", () => {
    render(<MessageContent chatId="c1" blocks={[{ type: "image", url: "https://cdn.example.com/apple.png", altText: "An apple" } as ContentBlock]} />);
    const download = screen.getByRole("link", { name: "Download An apple" });
    expect(download).toHaveAttribute("href", "https://cdn.example.com/apple.png");
    expect(download).toHaveAttribute("download");
    const reference = screen.getByRole("button", { name: "Use as reference" });
    expect(reference).toHaveAttribute("aria-disabled", "true");
    // the picture itself still opens the preview
    expect(screen.getByRole("button", { name: "Open An apple" })).toBeEnabled();
  });

  it("has no actions when the picture can't be shown", () => {
    render(<MessageContent chatId="c1" blocks={[{ type: "image", url: "javascript:alert(1)", altText: "Bad" } as ContentBlock]} />);
    expect(screen.getByText("Image unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Download/ })).not.toBeInTheDocument();
  });
});

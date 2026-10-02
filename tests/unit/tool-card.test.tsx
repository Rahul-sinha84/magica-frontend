import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Message } from "@/components/chat/Message";
import { MessageContent } from "@/components/chat/MessageContent";
import { ToolCard } from "@/components/chat/ToolCard";
import { toolOneLiner, toolTitle } from "@/lib/blocks";
import type { ContentBlock, Message as MessageData, ToolCallBlock, ToolResultBlock } from "@/types";

const call = (toolName: string, over: Partial<ToolCallBlock> = {}): ToolCallBlock => ({
  type: "tool_call", toolCallId: `s1-${toolName}`, toolName, toolInput: {}, status: "completed", durationMs: 1200, ...over,
});
const ok = (c: ToolCallBlock, result: unknown): ToolResultBlock => ({ type: "tool_result", toolCallId: c.toolCallId, toolName: c.toolName, result, isError: false });
const failed = (c: ToolCallBlock, errorMessage: string): ToolResultBlock => ({ type: "tool_result", toolCallId: c.toolCallId, toolName: c.toolName, isError: true, errorMessage });

describe("tool labels", () => {
  it("come from the backend's TOOL_LABELS", () => {
    expect(toolTitle("load_skill")).toBe("Load skill");
    expect(toolTitle("read_skill_asset")).toBe("Read skill file");
    expect(toolTitle("gpt_image_2")).toBe("GPT Image 2");
    expect(toolTitle("crop_image")).toBe("Crop Image");
    expect(toolTitle("merge_videos")).toBe("Merge Videos");
  });

  it("fall back to a readable name for tools it doesn't know", () => {
    expect(toolTitle("upscale_video")).toBe("Upscale video");
    expect(toolTitle("ai_generation")).toBe("AI generation");
  });

  it("show on the step", () => {
    render(<ToolCard call={call("gpt_image_2", { toolInput: { prompt: "a cat" } })} />);
    expect(screen.getByRole("button", { name: /GPT Image 2/ })).toBeInTheDocument();
  });
});

describe("one-line steps", () => {
  it("loading a skill is one line, like magica's \"Skill\" row, and can't be opened", () => {
    const c = call("load_skill", { toolInput: { name: "image-generation" } });
    expect(toolOneLiner(c)).toBe("image-generation");
    render(<ToolCard call={c} result={ok(c, { skill: "image-generation", loaded: true })} />);
    expect(screen.getByText("Load skill")).toBeInTheDocument();
    // magica shows only the step's name, not which skill
    expect(screen.queryByText("image-generation")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("reading a skill file is one line too, and can't be opened", () => {
    const c = call("read_skill_asset", { toolInput: { skill: "image-generation", path: "examples/presets.md" } });
    render(<ToolCard call={c} result={ok(c, { skill: "image-generation", path: "examples/presets.md", characters: 1840 })} />);
    expect(screen.getByText("Read skill file")).toBeInTheDocument();
    expect(screen.queryByText(/examples\/presets\.md/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("still says why when it failed", () => {
    const c = call("load_skill", { toolInput: { name: "nope" }, status: "failed" });
    render(<ToolCard call={c} result={failed(c, "That skill doesn't exist.")} />);
    expect(screen.getByRole("img", { name: "Failed" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("That skill doesn't exist.");
  });
});

describe("what a step made", () => {
  // details start open, as on magica
  const open = async (name: RegExp) => expect(screen.getByRole("button", { name })).toHaveAttribute("aria-expanded", "true");

  it("a step's details start open and can be closed", async () => {
    const c = call("gpt_image_2", { toolInput: { prompt: "a cat" } });
    render(<ToolCard call={c} result={ok(c, { url: "https://cdn.example.com/cat.png" })} />);
    expect(screen.getByText("a cat")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: /GPT Image 2/ }));
    expect(screen.queryByText("a cat")).not.toBeInTheDocument();
  });

  it("a picture shows as a preview", async () => {
    const c = call("gpt_image_2", { toolInput: { prompt: "a cat" }, creditCost: 70_000 });
    render(<ToolCard call={c} result={ok(c, { url: "https://cdn.example.com/cat.png", width: 1024, height: 1024, mimeType: "image/png" })} />);
    await open(/GPT Image 2/);
    expect(screen.getByRole("img", { name: "Output of this step" })).toHaveAttribute("src", "https://cdn.example.com/cat.png");
    expect(screen.getByText("Credits used")).toBeInTheDocument();
    expect(document.querySelector("video")).toBeNull();
  });

  it("a merge plays as a video", async () => {
    const c = call("merge_videos", { toolInput: { video_urls: ["https://a/1.mp4", "https://a/2.mp4"] } });
    render(<ToolCard call={c} result={ok(c, { url: "https://cdn.example.com/merged.mp4", mimeType: "video/mp4", durationMs: 8000 })} />);
    await open(/Merge Videos/);
    const video = screen.getByLabelText("Output of this step");
    expect(video.tagName).toBe("VIDEO");
    expect(video).toHaveAttribute("controls");
  });

  it("any tool whose output is a video/* plays as a video", async () => {
    const c = call("some_new_tool");
    render(<ToolCard call={c} result={ok(c, { url: "https://cdn.example.com/x.webm", mimeType: "video/webm" })} />);
    await open(/Some new tool/);
    expect(screen.getByLabelText("Output of this step").tagName).toBe("VIDEO");
  });

  it("several pictures show as a thumbnail each", async () => {
    const c = call("gpt_image_2", { toolInput: { prompt: "cats", n: 3 } });
    const urls = ["https://cdn.example.com/1.png", "https://cdn.example.com/2.png", "https://cdn.example.com/3.png"];
    render(<ToolCard call={c} result={ok(c, { url: urls[0], urls, width: 1024, height: 1024 })} />);
    await open(/GPT Image 2/);
    const thumbs = screen.getAllByRole("img", { name: /^Output \d of this step$/ });
    expect(thumbs.map((img) => img.getAttribute("src"))).toEqual(urls);
  });

  it("an address that isn't a web address is never loaded", async () => {
    const c = call("gpt_image_2", { toolInput: { prompt: "x" } });
    render(<ToolCard call={c} result={ok(c, { url: "javascript:alert(1)" })} />);
    await open(/GPT Image 2/);
    expect(screen.queryByRole("img", { name: "Output of this step" })).not.toBeInTheDocument();
  });

  it("a failed step shows its error", async () => {
    const c = call("crop_image", { toolInput: { image_url: "https://a/b.png" }, status: "failed" });
    render(<ToolCard call={c} result={failed(c, "The image couldn't be downloaded.")} />);
    expect(screen.getByRole("img", { name: "Failed" })).toBeInTheDocument();
    await open(/Crop Image/);
    expect(screen.getByRole("alert")).toHaveTextContent("The image couldn't be downloaded.");
  });

  it("a step stopped mid-run shows Failed with 'Stopped.'", async () => {
    const c = call("gpt_image_2", { toolInput: { prompt: "x" }, status: "failed", durationMs: undefined });
    render(<ToolCard call={c} result={failed(c, "Stopped.")} />);
    expect(screen.getByRole("img", { name: "Failed" })).toBeInTheDocument();
    await open(/GPT Image 2/);
    expect(screen.getByRole("alert")).toHaveTextContent("Stopped.");
  });
});

describe("a reply with tool results and no text", () => {
  const blocks: ContentBlock[] = [
    call("load_skill", { toolInput: { name: "image-generation" } }),
    call("gpt_image_2", { toolCallId: "s1-gen", toolInput: { prompt: "a cat" } }),
    { type: "tool_result", toolCallId: "s1-gen", toolName: "gpt_image_2", result: { url: "/cat.png" }, isError: false },
    { type: "image", url: "/cat.png", altText: "A cat", model: "GPT Image 2" },
    { type: "text", content: "" },
  ];
  const message: MessageData = {
    id: "m1", chatId: "c1", role: "ASSISTANT", content: "", contentBlocks: blocks, status: "COMPLETED", createdAt: new Date().toISOString(), agentRunId: "r1",
  };

  it("shows the steps and the picture, and no empty text bubble", () => {
    const { container } = render(<Message message={message} pending={false} />);
    expect(screen.getByRole("button", { name: /Completed 2 steps/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "A cat" })).toBeInTheDocument();
    expect(screen.queryByText("No response.")).not.toBeInTheDocument();
    // an empty text block would render as an empty Markdown wrapper
    const empty = [...container.querySelectorAll("div.min-w-0")].filter((el) => !el.textContent?.trim() && !el.querySelector("img,video,audio"));
    expect(empty).toHaveLength(0);
    // magica keeps Copy in the row even when there is no text
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
  });

  it("renders just the steps and the picture (the blank text is skipped)", () => {
    const { container } = render(<MessageContent blocks={blocks} chatId="c1" />);
    expect(screen.getByRole("img", { name: "A cat" })).toBeInTheDocument();
    expect(container.firstElementChild?.children).toHaveLength(2);
    expect(within(container).queryByText("", { selector: "p" })).toBeNull();
  });
});

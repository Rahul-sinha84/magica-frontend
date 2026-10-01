import { describe, expect, it } from "vitest";
import { copyText, creditsUsed, groupBlocks, isWorking, toolDetails } from "@/lib/blocks";
import { formatDuration, toolLabel } from "@/lib/utils";
import type { ContentBlock, ToolCallBlock } from "@/types";

const call = (id: string, over: Partial<ToolCallBlock> = {}): ToolCallBlock => ({
  type: "tool_call",
  toolCallId: id,
  toolName: "skill",
  toolInput: {},
  status: "completed",
  ...over,
});

describe("groupBlocks", () => {
  it("puts consecutive tool calls in one steps group and hides results", () => {
    const blocks: ContentBlock[] = [
      call("a"),
      call("b"),
      { type: "tool_result", toolCallId: "a", toolName: "skill", result: {}, isError: false },
      { type: "text", content: "done" },
    ];
    const segments = groupBlocks(blocks);
    expect(segments.map((s) => s.kind)).toEqual(["steps", "block"]);
    const steps = segments[0];
    expect(steps.kind === "steps" && steps.calls.map((c) => c.toolCallId)).toEqual(["a", "b"]);
  });

  it("keeps every step of a reply in one group, where the first step was (like magica)", () => {
    const segments = groupBlocks([call("a"), { type: "text", content: "x" }, call("b")]);
    expect(segments.map((s) => s.kind)).toEqual(["steps", "block"]);
    const steps = segments[0];
    expect(steps.kind === "steps" && steps.calls.map((c) => c.toolCallId)).toEqual(["a", "b"]);
  });

  it("shows one thinking row for all the model's rounds, keeping the first duration", () => {
    // the real shape: think, load a skill, think, generate, (image), think, answer
    const segments = groupBlocks([
      { type: "thinking", content: "First I need the skill.", durationMs: 4000 },
      call("load"),
      { type: "thinking", content: "Now generate the image." },
      call("gen"),
      { type: "image", url: "https://cdn.example.com/a.png" },
      { type: "thinking", content: "Tell the user." },
      { type: "text", content: "Here it is." },
    ]);
    expect(segments.map((s) => (s.kind === "steps" ? `steps:${s.calls.length}` : s.block.type))).toEqual(["thinking", "steps:2", "image", "text"]);
    const thinking = segments[0];
    expect(thinking.kind === "block" && thinking.block).toEqual({
      type: "thinking",
      content: "First I need the skill.\n\nNow generate the image.\n\nTell the user.",
      durationMs: 4000,
    });
  });

  it("takes a later duration when the first think has none", () => {
    const [thinking] = groupBlocks([
      { type: "thinking", content: "a" },
      { type: "thinking", content: "b", durationMs: 1500 },
    ]);
    expect(thinking.kind === "block" && thinking.block).toMatchObject({ durationMs: 1500 });
  });

  it("pairs a result with its call wherever it appears", () => {
    const segments = groupBlocks([
      { type: "tool_result", toolCallId: "a", toolName: "skill", result: { url: "u" }, isError: false },
      call("a"),
    ]);
    const steps = segments[0];
    expect(steps.kind === "steps" && steps.results.get("a")?.result).toEqual({ url: "u" });
  });
});

describe("isWorking", () => {
  it("is true while any step is pending or running", () => {
    expect(isWorking([call("a"), call("b", { status: "running" })])).toBe(true);
    expect(isWorking([call("a", { status: "pending" })])).toBe(true);
    expect(isWorking([call("a"), call("b", { status: "failed" })])).toBe(false);
  });
});

describe("creditsUsed", () => {
  it("prefers the usage block", () => {
    expect(creditsUsed([call("a", { creditCost: 5 }), { type: "usage", creditCost: 9 } as ContentBlock])).toBe(9);
  });
  it("falls back to the step costs", () => {
    expect(creditsUsed([call("a", { creditCost: 5 }), call("b", { creditCost: 7 })])).toBe(12);
  });
  it("is zero with nothing to count", () => {
    expect(creditsUsed([{ type: "text", content: "x" }])).toBe(0);
  });
});

describe("copyText", () => {
  it("uses the text blocks, then the plain content", () => {
    expect(copyText({ content: "plain", contentBlocks: [{ type: "text", content: "from blocks" }] })).toBe("from blocks");
    expect(copyText({ content: "plain", contentBlocks: [] })).toBe("plain");
    expect(copyText({ content: null, contentBlocks: [] })).toBe("");
  });
});

describe("toolDetails", () => {
  it("lists inputs with readable labels, skipping empty ones, and the cost", () => {
    const { rows } = toolDetails(call("a", { toolInput: { modelId: "m", prompt: "p", empty: "" }, creditCost: 70_000 }));
    expect(rows.map((r) => r.label)).toEqual(["Model ID", "Prompt", "Credits used"]);
    expect(rows[2].value).toBe("0.07M");
  });

  it("finds the output link and reports failures", () => {
    const ok = toolDetails(call("a"), { type: "tool_result", toolCallId: "a", toolName: "x", result: { imageUrl: "/i.png" }, isError: false });
    expect(ok.output).toEqual({ url: "/i.png", kind: "image", thumbnails: [] });
    const bad = toolDetails(call("a"), { type: "tool_result", toolCallId: "a", toolName: "x", result: null, isError: true, errorMessage: "boom" });
    expect(bad.error).toBe("boom");
    expect(bad.output).toBeNull();
  });

  it("cuts very long values", () => {
    const { rows } = toolDetails(call("a", { toolInput: { prompt: "x".repeat(5000) } }));
    expect(rows[0].value.length).toBeLessThan(2100);
  });
});

describe("labels", () => {
  it("turns tool and field names into words", () => {
    expect(toolLabel("ai_generation")).toBe("AI generation");
    expect(toolLabel("modelId")).toBe("Model ID");
  });
  it("formats durations", () => {
    expect(formatDuration(1700)).toBe("1.7s");
    expect(formatDuration(72_000)).toBe("1m 12s");
  });
});

import { blocksToText, TOOL_LABELS } from "@/contracts";
import { formatCredits, safeAssetUrl, toolLabel } from "@/lib/utils";
import type { ContentBlock, Message, ToolCallBlock, ToolResultBlock } from "@/types";

type ThinkingBlock = Extract<ContentBlock, { type: "thinking" }>;

export type Segment =
  | { kind: "block"; block: Exclude<ContentBlock, ToolCallBlock | ToolResultBlock> }
  | { kind: "steps"; calls: ToolCallBlock[]; results: Map<string, ToolResultBlock> };

// Consecutive tool calls become one "steps" group. A tool_result is never shown on its own: it is
// paired with its call by id, wherever it sits in the message.
export function groupBlocks(blocks: readonly ContentBlock[]): Segment[] {
  const results = new Map<string, ToolResultBlock>();
  for (const block of blocks) if (block.type === "tool_result") results.set(block.toolCallId, block);

  // Like magica, a reply has one "Thinking" row and one "Working · N steps" group, even though the model
  // thinks and calls tools in several rounds (think, load a skill, think, generate, think, answer). Every
  // step joins the group where the first step was, and every think joins the first thinking row.
  const segments: Segment[] = [];
  let steps: Extract<Segment, { kind: "steps" }> | null = null;
  let thinking: { kind: "block"; block: ThinkingBlock } | null = null;
  for (const block of blocks) {
    if (block.type === "tool_result") continue;
    if (block.type === "tool_call") {
      if (steps) steps.calls.push(block);
      else segments.push((steps = { kind: "steps", calls: [block], results }));
      continue;
    }
    if (block.type === "thinking") {
      if (!thinking) {
        segments.push((thinking = { kind: "block", block: { ...block } }));
      } else {
        const content = [thinking.block.content, block.content].filter((part) => part.trim()).join("\n\n");
        thinking.block = { ...thinking.block, content, durationMs: thinking.block.durationMs ?? block.durationMs };
      }
      continue;
    }
    segments.push({ kind: "block", block });
  }
  return segments;
}

export const isWorking = (calls: readonly ToolCallBlock[]) =>
  calls.some((call) => call.status === "pending" || call.status === "running");

// The total shown under a reply: the usage block's figure if there is one, else what the steps cost.
export function creditsUsed(blocks: readonly ContentBlock[]) {
  let usage = 0;
  let steps = 0;
  for (const block of blocks) {
    if (block.type === "usage") usage += block.creditCost ?? 0;
    if (block.type === "tool_call") steps += block.creditCost ?? 0;
  }
  return usage || steps;
}

// What the copy button puts on the clipboard: the reply's text, or the plain content as a fallback.
export function copyText(message: Pick<Message, "content" | "contentBlocks">) {
  return blocksToText(message.contentBlocks) || message.content || "";
}

const OUTPUT_URL_KEYS = ["url", "imageUrl", "videoUrl"];
const MAX_VALUE_LENGTH = 2000;

function show(value: unknown) {
  let text: string;
  if (typeof value === "string") text = value;
  else if (typeof value === "number" || typeof value === "boolean") text = String(value);
  else {
    try {
      text = JSON.stringify(value) ?? String(value);
    } catch {
      text = String(value);
    }
  }
  return text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH)}…` : text;
}

// A tool's name as the UI shows it: the backend's label for its own tools, a readable version of anything else.
export function toolTitle(name: string) {
  return (TOOL_LABELS as Readonly<Record<string, string>>)[name] ?? toolLabel(name);
}

// Steps that are one line, with nothing to open: loading a skill ("image-generation") and reading one of its
// files ("image-generation / examples/presets.md").
export function toolOneLiner(call: ToolCallBlock): string | null {
  const { name, skill, path } = call.toolInput;
  if ((call.toolName === "load_skill" || call.toolName === "skill") && typeof name === "string") return name;
  if (call.toolName === "read_skill_asset" && typeof skill === "string" && typeof path === "string") return `${skill} / ${path}`;
  return null;
}

// What a media step made, ready to show: the main output, whether it is a video, and a thumbnail per picture
// when it made several. Only addresses that are safe to load are kept.
export interface ToolOutput {
  url: string;
  kind: "image" | "video";
  thumbnails: string[];
}

function toolOutput(call: ToolCallBlock, output: Record<string, unknown> | null): ToolOutput | null {
  const raw = OUTPUT_URL_KEYS.map((key) => output?.[key]).find((value): value is string => typeof value === "string");
  const url = raw ? safeAssetUrl(raw) : null;
  if (!url) return null;
  const mimeType = typeof output?.mimeType === "string" ? output.mimeType : "";
  const video = call.toolName === "merge_videos" || mimeType.startsWith("video/") || (raw === output?.videoUrl && raw !== output?.url);
  const urls = Array.isArray(output?.urls) ? output.urls.filter((u): u is string => typeof u === "string") : [];
  const thumbnails = urls.map(safeAssetUrl).filter((u): u is string => !!u);
  return { url, kind: video ? "video" : "image", thumbnails: !video && thumbnails.length > 1 ? thumbnails : [] };
}

// What a step shows when it is opened: its inputs as label/value rows, what it cost, and what it made.
export function toolDetails(call: ToolCallBlock, result?: ToolResultBlock) {
  const rows = Object.entries(call.toolInput)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => ({ label: toolLabel(key), value: show(value) }));
  if (call.creditCost) rows.push({ label: "Credits used", value: formatCredits(call.creditCost) });

  const output = result && !result.isError && typeof result.result === "object" && result.result !== null ? (result.result as Record<string, unknown>) : null;
  return { rows, output: toolOutput(call, output), error: result?.isError ? (result.errorMessage ?? "This step failed.") : undefined };
}

import { blocksToText } from "@/contracts";
import { formatCredits, toolLabel } from "@/lib/utils";
import type { ContentBlock, Message, ToolCallBlock, ToolResultBlock } from "@/types";

export type Segment =
  | { kind: "block"; block: Exclude<ContentBlock, ToolCallBlock | ToolResultBlock> }
  | { kind: "steps"; calls: ToolCallBlock[]; results: Map<string, ToolResultBlock> };

// Consecutive tool calls become one "steps" group. A tool_result is never shown on its own: it is
// paired with its call by id, wherever it sits in the message.
export function groupBlocks(blocks: readonly ContentBlock[]): Segment[] {
  const results = new Map<string, ToolResultBlock>();
  for (const block of blocks) if (block.type === "tool_result") results.set(block.toolCallId, block);

  const segments: Segment[] = [];
  for (const block of blocks) {
    if (block.type === "tool_result") continue;
    if (block.type !== "tool_call") {
      segments.push({ kind: "block", block });
      continue;
    }
    const last = segments.at(-1);
    if (last?.kind === "steps") last.calls.push(block);
    else segments.push({ kind: "steps", calls: [block], results });
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

// What a step shows when it is opened: its inputs as label/value rows, what it cost, and what it made.
export function toolDetails(call: ToolCallBlock, result?: ToolResultBlock) {
  const rows = Object.entries(call.toolInput)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => ({ label: toolLabel(key), value: show(value) }));
  if (call.creditCost) rows.push({ label: "Credits used", value: formatCredits(call.creditCost) });

  const output = result && !result.isError && typeof result.result === "object" && result.result !== null ? (result.result as Record<string, unknown>) : null;
  const outputUrl = OUTPUT_URL_KEYS.map((key) => output?.[key]).find((value): value is string => typeof value === "string");
  return { rows, outputUrl, error: result?.isError ? (result.errorMessage ?? "This step failed.") : undefined };
}

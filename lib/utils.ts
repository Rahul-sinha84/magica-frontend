import { type ClassValue, clsx } from "clsx";
import { format } from "date-fns";
import { twMerge } from "tailwind-merge";
import type { AgentStreamMetadata, Chat, Credits, RunStatus } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

// Counts what a reader sees as one character, so an emoji is never cut in half.
export function truncate(text: string, maxLength: number) {
  const chars = Array.from(graphemes.segment(text), ({ segment }) => segment);
  return chars.length <= maxLength ? text : `${chars.slice(0, maxLength).join("")}...`;
}

// A task can come back with an empty title (for example if naming it failed).
export function chatTitle(chat: Pick<Chat, "title">) {
  return chat.title.trim() || "Untitled task";
}

// What can still be spent: credits reserved by runs in flight are not available.
export function availableCredits({ balance, held }: Credits) {
  return Math.max(0, balance - held);
}

// "ai_generation" -> "AI generation", "model_schema" -> "Model schema", "modelId" -> "Model ID"
export function toolLabel(name: string) {
  const words = name.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "Tool";
  const shout = new Set(["ai", "id", "url", "api"]);
  return words
    .map((word, i) => (shout.has(word.toLowerCase()) ? word.toUpperCase() : i === 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

// 1700 -> "1.7s", 34700 -> "34.7s", 72000 -> "1m 12s"
export function formatDuration(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return "";
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

// 29_660_000 -> "29.66M", 290_000 -> "0.29M", 9_500 -> "9,500"
export function formatCredits(value: number) {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 10_000) return `${(value / 1_000_000).toFixed(2)}M`;
  return (Math.round(value) || 0).toLocaleString("en-US"); // `|| 0` avoids printing "-0"
}

// "2:42 PM", in the viewer's timezone
export function formatClockTime(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : format(date, "h:mm a");
}

const TERMINAL_STATUSES = new Set<RunStatus | AgentStreamMetadata["status"]>([
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "complete",
  "failed",
  "cancelled",
]);

export function isTerminalStatus(status: RunStatus | AgentStreamMetadata["status"]) {
  return TERMINAL_STATUSES.has(status);
}

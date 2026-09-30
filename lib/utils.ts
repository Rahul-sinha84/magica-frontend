import { type ClassValue, clsx } from "clsx";
import { format } from "date-fns";
import { twMerge } from "tailwind-merge";
import type { AgentStreamMetadata, RunStatus } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

// Counts what a reader sees as one character, so an emoji is never cut in half.
export function truncate(text: string, maxLength: number) {
  const chars = Array.from(graphemes.segment(text), ({ segment }) => segment);
  return chars.length <= maxLength ? text : `${chars.slice(0, maxLength).join("")}...`;
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

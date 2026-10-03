"use client";

import { useState } from "react";
import { Box, ChevronDown, CircleCheck, CircleStop, CircleX, ClipboardList, Clock, Coins, LoaderCircle, MessageSquare, TimerOff, type LucideIcon } from "lucide-react";
import type { WaitpointBlock, WaitpointStatus } from "@/contracts";
import { clip, toolTitle } from "@/lib/blocks";
import { cn, formatDuration } from "@/lib/utils";
import { formatMillions } from "@/lib/waitpoints";

const OUTCOMES: Record<WaitpointStatus, { plan: string; credit: string; Icon: LucideIcon; className: string; label: string }> = {
  approved: { plan: "Plan approved", credit: "Spend approved", Icon: CircleCheck, className: "text-[#16a34a]", label: "Approved" },
  changes_requested: { plan: "Changes requested", credit: "Changes requested", Icon: MessageSquare, className: "text-text-secondary", label: "Changes requested" },
  rejected: { plan: "Plan declined", credit: "Spend declined", Icon: CircleX, className: "text-text-secondary", label: "Declined" },
  expired: { plan: "Expired", credit: "Expired", Icon: TimerOff, className: "text-text-tertiary", label: "Expired" },
  cancelled: { plan: "Stopped", credit: "Stopped", Icon: CircleStop, className: "text-text-tertiary", label: "Stopped" },
  pending: { plan: "Waiting for approval", credit: "Waiting for approval", Icon: LoaderCircle, className: "animate-spin text-text-tertiary", label: "Waiting" },
};

// how long the question waited, shown once the user answered it
const ANSWERED = new Set<WaitpointStatus>(["approved", "changes_requested", "rejected"]);

// What was proposed, as the rows of a step's key/value table.
function rowsOf(block: WaitpointBlock): { label: string; value: string }[] {
  if (block.waitpointType === "plan") {
    const plan = block.payload;
    return [
      { label: "Title", value: plan.title },
      ...(plan.overview ? [{ label: "Overview", value: plan.overview }] : []),
      ...plan.steps.map((step, i) => ({
        label: `Step ${i + 1}`,
        value: [`${step.title}${step.estimatedCredits > 0 ? ` (~${formatMillions(step.estimatedCredits)})` : ""}`, step.description].filter(Boolean).join("\n"),
      })),
      { label: "Total estimated", value: `~${formatMillions(plan.totalCredits)} credits` },
      ...(plan.notes ? [{ label: "Notes", value: plan.notes }] : []),
    ];
  }
  const spend = block.payload;
  return [
    ...spend.calls.map((call, i) => ({ label: `Call ${i + 1}`, value: `${toolTitle(call.toolName)} (${formatMillions(call.credits)})` })),
    { label: "Total", value: `${formatMillions(spend.totalCredits)} credits` },
  ];
}

// A plan or a spend in the reply, after it was answered (or expired, or stopped), laid out like a tool step: "Plan
// approved ✓ [cube] ⏱ 1m 16s", "Changes requested" with what was asked for, "Spend declined"… Opening it shows what
// was proposed in the same key/value table the tool steps use.
export function WaitpointStep({ block }: { block: WaitpointBlock }) {
  const [open, setOpen] = useState(false);
  const outcome = OUTCOMES[block.status];
  const label = block.waitpointType === "plan" ? outcome.plan : outcome.credit;
  const Icon = block.waitpointType === "plan" ? ClipboardList : Coins;
  const waited = ANSWERED.has(block.status) && block.waitedMs !== undefined ? formatDuration(block.waitedMs) : "";
  const rows = rowsOf(block);

  return (
    <div className="relative py-2 pl-7">
      <Icon className="absolute left-0 top-2.5 size-5 text-text-secondary" aria-hidden="true" />
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-5 w-full items-center gap-1.5 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="text-sm font-medium leading-5 text-text-primary">{label}</span>
        <span className="inline-flex shrink-0" role="img" aria-label={outcome.label}>
          <outcome.Icon className={cn("size-3", outcome.className)} aria-hidden="true" />
        </span>
        <Box className="size-3 shrink-0 text-[#181818] dark:text-text-primary" aria-hidden="true" />
        {waited && (
          <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium leading-4 tabular-nums text-text-primary">
            <Clock className="size-2.5" aria-hidden="true" />
            {waited}
          </span>
        )}
        <span className="flex-1" />
        <ChevronDown className={cn("size-3.5 shrink-0 text-text-secondary transition-transform", !open && "-rotate-90")} aria-hidden="true" />
      </button>
      {block.status === "changes_requested" && block.feedback && (
        <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-[19.5px] text-text-secondary">“{block.feedback}”</p>
      )}
      {open && (
        <div className="mt-2 rounded-[10px] border border-line-tertiary px-3 py-2.5">
          {rows.map(({ label: name, value }, i) => (
            <div key={`${name}-${i}`} className={cn("flex gap-2", i > 0 && "mt-2")}>
              <span className="w-20 shrink-0 pt-1.5 text-xs font-medium leading-4 text-text-primary">{name}</span>
              <p className="min-w-0 flex-1 whitespace-pre-wrap break-words py-1 text-xs font-medium leading-[19.5px] text-text-primary">{clip(value)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

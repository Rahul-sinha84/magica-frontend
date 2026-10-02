"use client";

import { useState } from "react";
import { ChevronDown, CircleCheck, CircleStop, CircleX, ClipboardList, Coins, LoaderCircle, MessageSquare, TimerOff, type LucideIcon } from "lucide-react";
import type { WaitpointBlock, WaitpointStatus } from "@/contracts";
import { cn, formatDuration } from "@/lib/utils";
import { PlanSections, SpendSections } from "./WaitpointCard";

const OUTCOMES: Record<WaitpointStatus, { plan: string; credit: string; Icon: LucideIcon; className: string }> = {
  approved: { plan: "Plan approved", credit: "Spend approved", Icon: CircleCheck, className: "text-[#16a34a]" },
  changes_requested: { plan: "Changes requested", credit: "Changes requested", Icon: MessageSquare, className: "text-text-secondary" },
  rejected: { plan: "Plan declined", credit: "Spend declined", Icon: CircleX, className: "text-text-secondary" },
  expired: { plan: "Expired", credit: "Expired", Icon: TimerOff, className: "text-text-tertiary" },
  cancelled: { plan: "Stopped", credit: "Stopped", Icon: CircleStop, className: "text-text-tertiary" },
  pending: { plan: "Waiting for approval", credit: "Waiting for approval", Icon: LoaderCircle, className: "animate-spin text-text-tertiary" },
};

// how long the question waited, shown once the user answered it
const ANSWERED = new Set<WaitpointStatus>(["approved", "changes_requested", "rejected"]);

// A plan or a spend in the reply, after it was answered (or expired, or stopped), laid out as a step: "Plan approved ✓
// · 1m 16s", "Changes requested" with what was asked for, "Spend declined"… Opening it shows what was proposed.
export function WaitpointStep({ block }: { block: WaitpointBlock }) {
  const [open, setOpen] = useState(false);
  const outcome = OUTCOMES[block.status];
  const label = block.waitpointType === "plan" ? outcome.plan : outcome.credit;
  const Icon = block.waitpointType === "plan" ? ClipboardList : Coins;
  const waited = ANSWERED.has(block.status) && block.waitedMs !== undefined ? formatDuration(block.waitedMs) : "";

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
        <outcome.Icon className={cn("size-3 shrink-0", outcome.className)} aria-hidden="true" />
        {waited && <span className="shrink-0 font-mono text-xs font-medium leading-4 text-text-secondary">· {waited}</span>}
        <span className="flex-1" />
        <ChevronDown className={cn("size-3.5 shrink-0 text-text-secondary transition-transform", !open && "-rotate-90")} aria-hidden="true" />
      </button>
      {block.status === "changes_requested" && block.feedback && (
        <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-[19.5px] text-text-secondary">“{block.feedback}”</p>
      )}
      {open && (
        <div className="mt-2 overflow-hidden rounded-[10px] border border-line-tertiary">
          {block.waitpointType === "plan" ? <PlanSections plan={block.payload} /> : <SpendSections spend={block.payload} />}
        </div>
      )}
    </div>
  );
}

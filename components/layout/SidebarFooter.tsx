"use client";

import { useState } from "react";
import { ArrowRight, EllipsisVertical, Settings, Sparkles, Users, Wallet } from "lucide-react";
import { CreditsRow } from "@/components/credits/CreditsBadge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ThemeToggle } from "./ThemeToggle";
import { UserBadge } from "./UserBadge";

const INERT = "Not available in this build";
const outlined =
  "flex items-center rounded-lg border border-line-tertiary bg-surface-main text-sm font-medium text-text-secondary outline-none hover:bg-surface-secondary focus-visible:ring-2 focus-visible:ring-ring";

export function SidebarFooter({ rail }: { rail: boolean }) {
  const [expanded, setExpanded] = useState(true);

  if (rail) {
    return (
      <div className="flex justify-center pb-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Settings"
              title={INERT}
              className="flex size-8 items-center justify-center rounded-lg text-icon-primary outline-none hover:bg-surface-secondary focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Settings className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Settings</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="flex flex-col px-2 pb-1">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((open) => !open)}
        className="flex h-[34px] items-center gap-2.5 rounded-lg px-2 text-sm text-text-secondary outline-none hover:bg-surface-secondary focus-visible:ring-2 focus-visible:ring-ring"
      >
        <EllipsisVertical className="size-4" />
        {expanded ? "Less" : "More"}
      </button>

      {expanded && (
        <>
          <div className="mt-1">
            <CreditsRow />
          </div>
          <button
            type="button"
            title={INERT}
            className="mt-2 flex h-8 items-center justify-center gap-[7px] rounded-lg bg-gradient-to-b from-[#3b3b3b] to-[#2b2b2b] px-4 text-xs font-medium text-[#f7f7f7] shadow-[0_0_0_1px_#303030,inset_0_1px_0_rgba(255,255,255,0.15)] outline-none hover:from-[#343434] hover:to-[#252525] focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Wallet className="size-4" />
            Add Credits
          </button>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" title={INERT} className={`${outlined} h-7 justify-center gap-1.5 px-3`}>
              <Settings className="size-4" />
              Settings
            </button>
            <button type="button" title={INERT} className={`${outlined} h-7 justify-center gap-1.5 px-3`}>
              <Sparkles className="size-4" />
              Updates
            </button>
          </div>
          <button type="button" title={INERT} className={`${outlined} mt-2 h-[34px] gap-2.5 px-2`}>
            <Users className="size-4" />
            <span className="flex-1 text-left">Invite team members</span>
            <ArrowRight className="size-3.5" />
          </button>
        </>
      )}

      <div className="mt-3">
        <ThemeToggle />
      </div>
      <div className="mt-1.5">
        <UserBadge />
      </div>
    </div>
  );
}

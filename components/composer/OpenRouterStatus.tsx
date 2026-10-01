"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useModels } from "@/hooks/useModels";
import { cn } from "@/lib/utils";
import type { ModelHealth } from "@/types";

const LOOK: Record<ModelHealth, { dot: string; label: string; note?: string }> = {
  available: { dot: "bg-[#22c55e]", label: "available" },
  degraded: { dot: "bg-[#f59e0b]", label: "busy", note: "Free models are busy right now, so replies may be slow." },
  unavailable: {
    dot: "bg-[#ef4444]",
    label: "not answering",
    note: "Free models aren't answering right now. You can still send; it may fail.",
  },
  unknown: { dot: "bg-text-disabled", label: "status unknown" },
};

// The free model and how it has been doing lately, small and quiet in the composer. It only informs:
// sending is never blocked because of it (the server decides). Loading, or a failed request, reads as
// "unknown".
export function OpenRouterStatus() {
  const { data } = useModels();
  const health: ModelHealth = data?.status.health ?? "unknown";
  const look = LOOK[health];
  const lastModel = data?.status.lastRoutedModel;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          aria-label={`OpenRouter Free, ${look.label}`}
          data-health={health}
          className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs text-text-secondary outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className={cn("size-1.5 shrink-0 rounded-full", look.dot)} aria-hidden="true" />
          OpenRouter Free
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-64">
        <p className="font-medium">Free model</p>
        {lastModel && <p>Last answered by {lastModel}</p>}
        {look.note && <p>{look.note}</p>}
      </TooltipContent>
    </Tooltip>
  );
}

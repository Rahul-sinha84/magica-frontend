"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { isWorking } from "@/lib/blocks";
import type { ToolCallBlock, ToolResultBlock } from "@/types";
import { ToolCard } from "./ToolCard";

interface Props {
  calls: ToolCallBlock[];
  results: Map<string, ToolResultBlock>;
}

// "Working · 3 steps" while steps are running, "Completed 4 steps" after. Open while working,
// closed once done, like magica.com.
export function StepGroup({ calls, results }: Props) {
  const working = isWorking(calls);
  const [open, setOpen] = useState(working);
  const failed = calls.filter((call) => call.status === "failed").length;
  const steps = `${calls.length} ${calls.length === 1 ? "step" : "steps"}`;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="group flex items-center gap-1 rounded-md text-sm font-medium text-text-secondary outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {working ? `Working · ${steps}` : `Completed ${steps}`}
        {failed > 0 && !working && <span className="text-destructive">· {failed} failed</span>}
        <ChevronRight
          className="size-3.5 opacity-0 transition-[transform,opacity] group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[state=open]:rotate-90 group-data-[state=open]:opacity-100"
          aria-hidden="true"
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="mt-1">
          {calls.map((call) => (
            <li key={call.toolCallId}>
              <ToolCard call={call} result={results.get(call.toolCallId)} />
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

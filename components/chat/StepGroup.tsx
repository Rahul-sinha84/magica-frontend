"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { isWorking } from "@/lib/blocks";
import { cn } from "@/lib/utils";
import type { ToolCallBlock, ToolResultBlock } from "@/types";
import { ToolCard } from "./ToolCard";

interface Props {
  calls: ToolCallBlock[];
  results: Map<string, ToolResultBlock>;
  // the reply is still being written and nothing has come after these steps yet: the agent is on them, even
  // between one step and the next
  ongoing?: boolean;
}

// magica's step list. While the agent works: "Working · N steps" with a shimmer, open, so each step shows
// as it runs. When it's done: "Completed N steps", folded away (open it to see the steps). The chevron
// shows on hover when closed, and points down when open.
export function StepGroup({ calls, results, ongoing = false }: Props) {
  // so a step that finished at once (loading a skill) doesn't leave the list closed, or labelled "Completed",
  // while the agent picks and runs the next one
  const working = ongoing || isWorking(calls);
  const [open, setOpen] = useState(working);
  // closed by the reader while the agent was working: it isn't opened again for them (until they do it)
  const closedByReader = useRef(false);
  // open when work starts (unless the reader closed it), and fold away when it finishes, as magica does
  const wasWorking = useRef(working);
  useEffect(() => {
    if (!wasWorking.current && working && !closedByReader.current) setOpen(true);
    if (wasWorking.current && !working) setOpen(false);
    wasWorking.current = working;
  }, [working]);
  function toggle(next: boolean) {
    setOpen(next);
    closedByReader.current = !next && working;
  }
  const failed = calls.filter((call) => call.status === "failed").length;
  const steps = `${calls.length} ${calls.length === 1 ? "step" : "steps"}`;

  return (
    <Collapsible open={open} onOpenChange={toggle}>
      <CollapsibleTrigger
        className={cn(
          "group flex items-center gap-1 rounded-md text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
          open && !working ? "text-text-primary" : "text-text-secondary",
        )}
      >
        <span className={working ? "thinking-shimmer" : undefined}>{working ? `Working · ${steps}` : `Completed ${steps}`}</span>
        {failed > 0 && !working && <span className="text-destructive">· {failed} failed</span>}
        <ChevronRight
          className="size-3.5 opacity-0 transition-[transform,opacity] group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[state=open]:rotate-90 group-data-[state=open]:opacity-100"
          aria-hidden="true"
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul>
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

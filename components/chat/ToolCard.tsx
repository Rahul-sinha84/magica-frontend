"use client";

import { useState } from "react";
import { CheckCircle2, ChevronRight, Clock, Crop, FileText, Film, Loader2, Sparkles, Wrench, XCircle, Zap, type LucideIcon } from "lucide-react";
import { toolDetails, toolOneLiner, toolTitle, type ToolOutput } from "@/lib/blocks";
import { cn, formatCredits, formatDuration } from "@/lib/utils";
import type { ToolCallBlock, ToolResultBlock } from "@/types";

const ICONS: Record<string, { Icon: LucideIcon; className: string }> = {
  // the backend's tools
  load_skill: { Icon: Zap, className: "text-amber-500" },
  read_skill_asset: { Icon: FileText, className: "text-amber-500" },
  gpt_image_2: { Icon: Sparkles, className: "text-icon-primary" },
  crop_image: { Icon: Crop, className: "text-icon-primary" },
  merge_videos: { Icon: Film, className: "text-icon-primary" },
  // older names, still found in saved replies
  skill: { Icon: Zap, className: "text-amber-500" },
  model_schema: { Icon: Wrench, className: "text-blue-500" },
  ai_generation: { Icon: Sparkles, className: "text-icon-primary" },
};

const STATUS = {
  pending: { label: "Waiting", icon: <Loader2 className="size-3.5 animate-spin text-text-tertiary" /> },
  running: { label: "Running", icon: <Loader2 className="size-3.5 animate-spin text-blue-500" /> },
  completed: { label: "Done", icon: <CheckCircle2 className="size-3.5 text-green-600" /> },
  failed: { label: "Failed", icon: <XCircle className="size-3.5 text-destructive" /> },
} as const;

// What a step made: a video plays in place, a picture shows as a preview, and several pictures show as a
// row of thumbnails.
function Output({ output }: { output: ToolOutput }) {
  if (output.kind === "video") {
    return <video src={output.url} controls preload="metadata" aria-label="Output of this step" className="max-h-60 w-full max-w-full rounded-lg bg-surface-primary" />;
  }
  if (output.thumbnails.length > 1) {
    return (
      <ul className="flex flex-wrap gap-2">
        {output.thumbnails.map((url, i) => (
          <li key={url}>
            {/* eslint-disable-next-line @next/next/no-img-element -- generated pictures come from anywhere */}
            <img src={url} alt={`Output ${i + 1} of this step`} loading="lazy" className="size-16 rounded-md bg-surface-primary object-cover" />
          </li>
        ))}
      </ul>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- generated pictures come from anywhere
    <img src={output.url} alt="Output of this step" loading="lazy" className="max-h-60 w-auto max-w-full rounded-lg" />
  );
}

// One step of an agent's work: what it was, whether it worked, how long it took; open it for the details.
export function ToolCard({ call, result }: { call: ToolCallBlock; result?: ToolResultBlock }) {
  const [open, setOpen] = useState(false);
  const { Icon, className } = ICONS[call.toolName] ?? { Icon: Wrench, className: "text-icon-secondary" };
  const { rows, output, error } = toolDetails(call, result);
  // loading a skill, or reading one of its files, is one line: there is nothing more to see
  const oneLiner = toolOneLiner(call);
  const expandable = !oneLiner && (rows.length > 0 || !!output || !!error);
  const status = STATUS[call.status];

  const header = (
    <>
      <Icon className={cn("size-5 shrink-0", className)} aria-hidden="true" />
      <span className="shrink-0 text-sm font-medium text-text-primary">{toolTitle(call.toolName)}</span>
      {oneLiner && <span className="min-w-0 truncate text-sm text-text-secondary">{oneLiner}</span>}
      <span className="inline-flex shrink-0" role="img" aria-label={status.label}>
        {status.icon}
      </span>
      {call.durationMs !== undefined && (
        <span className="inline-flex shrink-0 items-center gap-1 font-mono text-xs text-text-secondary">
          <Clock className="size-3" aria-hidden="true" />
          {formatDuration(call.durationMs)}
        </span>
      )}
      {expandable && (
        <span className="ml-auto flex items-center gap-1 text-xs text-text-secondary">
          {call.creditCost ? formatCredits(call.creditCost) : null}
          <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} aria-hidden="true" />
        </span>
      )}
    </>
  );

  return (
    <div className="py-1.5">
      {expandable ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {header}
        </button>
      ) : (
        <div className="flex w-full items-center gap-2">{header}</div>
      )}

      {/* a one-line step that failed still says why */}
      {oneLiner && error && (
        <p role="alert" className="ml-7 mt-1 text-[13px] text-destructive">
          {error}
        </p>
      )}

      {expandable && open && (
        <div className="mt-2 overflow-hidden rounded-lg border border-line-tertiary text-[13px]">
          <dl>
            {rows.map(({ label, value }) => (
              <div key={label} className="flex gap-4 px-3 py-2 not-last:border-b not-last:border-line-tertiary">
                <dt className="w-24 shrink-0 text-text-secondary">{label}</dt>
                <dd className="min-w-0 whitespace-pre-wrap break-words text-text-primary">{value}</dd>
              </div>
            ))}
          </dl>
          {error && <p role="alert" className="border-t border-line-tertiary px-3 py-2 text-destructive">{error}</p>}
          {output && (
            <div className="flex gap-4 border-t border-line-tertiary px-3 py-2">
              <span className="w-24 shrink-0 text-text-secondary">Output</span>
              <div className="min-w-0 flex-1">
                <Output output={output} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

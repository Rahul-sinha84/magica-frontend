"use client";

import { useState } from "react";
import {
  ChevronDown,
  CircleCheck,
  CircleX,
  Clock,
  Crop,
  Download,
  FileText,
  Film,
  Image as ImageIcon,
  ImagePlus,
  LoaderCircle,
  Sparkles,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { toolDetails, toolOneLiner, toolTitle, type ToolOutput } from "@/lib/blocks";
import { cn, formatCredits, formatDuration } from "@/lib/utils";
import type { ToolCallBlock, ToolResultBlock } from "@/types";

const ICONS: Record<string, { Icon: LucideIcon; className: string }> = {
  // the backend's tools
  load_skill: { Icon: Zap, className: "text-[#d97706]" },
  read_skill_asset: { Icon: FileText, className: "text-[#d97706]" },
  gpt_image_2: { Icon: Sparkles, className: "text-text-primary" },
  crop_image: { Icon: Crop, className: "text-text-primary" },
  merge_videos: { Icon: Film, className: "text-text-primary" },
  // older names, still found in saved replies
  skill: { Icon: Zap, className: "text-[#d97706]" },
  model_schema: { Icon: Wrench, className: "text-[#2563eb]" },
  ai_generation: { Icon: Sparkles, className: "text-text-primary" },
};

// magica's 12px status marks: a blue spinner while running, a green check when done, a red cross on failure
const STATUS = {
  pending: { label: "Waiting", icon: <LoaderCircle className="size-3 animate-spin text-text-tertiary" /> },
  running: { label: "Running", icon: <LoaderCircle className="size-3 animate-spin text-[#0b62f1]" /> },
  completed: { label: "Done", icon: <CircleCheck className="size-3 text-[#16a34a]" /> },
  failed: { label: "Failed", icon: <CircleX className="size-3 text-destructive" /> },
} as const;

const overlayButton =
  "flex size-7 items-center justify-center rounded-[4px] bg-[rgba(10,10,11,0.5)] text-white outline-none hover:bg-[rgba(10,10,11,0.7)] focus-visible:ring-2 focus-visible:ring-white";

// What a step made, as magica shows it in the step's card: a 384px preview with its corner actions, a video
// that plays in place, or a thumbnail per picture when it made several.
function Output({ output }: { output: ToolOutput }) {
  if (output.kind === "video") {
    return <video src={output.url} controls preload="metadata" aria-label="Output of this step" className="w-full max-w-[384px] rounded-xl bg-surface-primary" />;
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
    <div className="group/output relative size-full max-h-[384px] max-w-[384px] overflow-hidden rounded-xl">
      {/* eslint-disable-next-line @next/next/no-img-element -- generated pictures come from anywhere */}
      <img src={output.url} alt="Output of this step" loading="lazy" className="max-h-[384px] w-full rounded-xl object-contain" />
      <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover/output:opacity-100 [@media(hover:none)]:opacity-100">
        <button type="button" aria-label="Use as reference" title="Not available in this build" aria-disabled="true" className={overlayButton}>
          <ImagePlus className="size-4" aria-hidden="true" />
        </button>
        <a href={output.url} download target="_blank" rel="noopener noreferrer" aria-label="Download output" className={overlayButton}>
          <Download className="size-4" aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}

// One step of the agent's work, laid out as magica does: the tool's icon in the left gutter, its name, a status
// mark, a duration, and (for steps with inputs) a card of what went in and what came out, open by default.
export function ToolCard({ call, result }: { call: ToolCallBlock; result?: ToolResultBlock }) {
  const [open, setOpen] = useState(true);
  const { Icon, className } = ICONS[call.toolName] ?? { Icon: Wrench, className: "text-text-secondary" };
  const { rows, output, error } = toolDetails(call, result);
  // loading a skill, or reading one of its files, is one line with nothing to open (magica: "Skill")
  const oneLiner = toolOneLiner(call) !== null;
  const expandable = !oneLiner && (rows.length > 0 || !!output || !!error);
  const status = STATUS[call.status];
  const OutputMark = output?.kind === "video" ? Film : output ? ImageIcon : null;

  const header = (
    <>
      <span className="text-sm font-medium leading-5 text-text-primary">{toolTitle(call.toolName)}</span>
      <span className="inline-flex shrink-0" role="img" aria-label={status.label}>
        {status.icon}
      </span>
      {OutputMark && <OutputMark className="size-3 shrink-0 text-[#181818] dark:text-text-primary" aria-hidden="true" />}
      {call.durationMs !== undefined && (
        <span className="inline-flex shrink-0 items-center gap-0.5 font-mono text-xs font-medium leading-4 text-text-primary">
          <Clock className="size-2.5" aria-hidden="true" />
          {formatDuration(call.durationMs)}
        </span>
      )}
      <span className="flex-1" />
      {expandable && (
        <span className="flex shrink-0 items-center gap-1 font-mono text-xs leading-4 text-text-primary">
          {call.creditCost ? formatCredits(call.creditCost) : null}
          <ChevronDown className={cn("size-3.5 text-text-secondary transition-transform", !open && "-rotate-90")} aria-hidden="true" />
        </span>
      )}
    </>
  );

  return (
    <div className="relative py-2 pl-7">
      <Icon className={cn("absolute left-0 top-2.5 size-5", className)} aria-hidden="true" />
      {expandable ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex h-5 w-full items-center gap-1.5 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {header}
        </button>
      ) : (
        <div className="flex h-5 w-full items-center gap-1.5">{header}</div>
      )}

      {/* a one-line step that failed still says why */}
      {oneLiner && error && (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      )}

      {expandable && open && (
        <div className="mt-2 rounded-[10px] border border-line-tertiary px-3 py-2.5">
          {rows.map(({ label, value }, i) => (
            <div key={label} className={cn("flex gap-2", i > 0 && "mt-2")}>
              <span className="w-20 shrink-0 pt-1.5 text-xs font-medium leading-4 text-text-primary">{label}</span>
              <p className="min-w-0 flex-1 whitespace-pre-wrap break-words py-1 text-xs font-medium leading-[19.5px] text-text-primary">{value}</p>
            </div>
          ))}
          {error && (
            <p role="alert" className={cn("text-xs text-destructive", rows.length > 0 && "mt-2")}>
              {error}
            </p>
          )}
          {output && (
            <div className={cn("flex gap-2", rows.length > 0 && "mt-2 border-t border-line-tertiary pt-2")}>
              <span className="w-20 shrink-0 text-xs font-medium leading-4 text-text-primary">Output</span>
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

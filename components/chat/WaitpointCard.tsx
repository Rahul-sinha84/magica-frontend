"use client";

import { useEffect, useEffectEvent, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Check, Coins, ListChecks, MessageSquare, Play, X } from "lucide-react";
import { FEEDBACK_MAX, type CreditPayload, type PlanPayload } from "@/contracts";
import { useRespondWaitpoint } from "@/hooks/useRespondWaitpoint";
import { toolTitle } from "@/lib/blocks";
import { cn } from "@/lib/utils";
import { formatMillions, type PendingWaitpoint } from "@/lib/waitpoints";

const INERT = "Not available in this build";
const FEEDBACK_PLACEHOLDER = "What would you like changed? (e.g., 'Skip the narration' or 'Use a more cinematic style')";

const section = "px-5 py-3";
const kbd = "inline-flex h-4 items-center rounded border border-line-secondary bg-surface-main px-1 font-mono text-[10px] leading-none text-text-secondary";
const button =
  "flex h-[30px] shrink-0 items-center gap-1.5 rounded-[10px] text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-[#8a8a8a] focus-visible:ring-offset-2 focus-visible:ring-offset-surface-main disabled:opacity-50";
const outline = cn(button, "border border-line-secondary bg-surface-main px-3 text-text-secondary hover:bg-surface-primary aria-disabled:cursor-default aria-disabled:opacity-50 aria-disabled:hover:bg-surface-main");
const dark = cn(button, "bg-primary px-4 text-white hover:bg-primary/90");

// The plan as magica lays it out: its title and overview, the numbered steps with what each should cost, the
// estimated total, and any notes.
function PlanSections({ plan }: { plan: PlanPayload }) {
  return (
    <div className="divide-y divide-line-tertiary">
      <div className={section}>
        <h3 className="text-sm font-semibold text-text-primary">{plan.title}</h3>
        {plan.overview && <p className="mt-1 whitespace-pre-wrap text-sm leading-[22.75px] text-text-secondary">{plan.overview}</p>}
      </div>
      <ol aria-label="Steps" className={cn(section, "flex flex-col")}>
        {plan.steps.map((step, i) => (
          <li key={i} className="flex gap-3 rounded-[10px] px-3 py-2">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-secondary text-[10px] font-medium text-text-secondary" aria-hidden="true">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-text-primary">{step.title}</p>
              {step.description && <p className="text-xs leading-[19.5px] text-text-secondary">{step.description}</p>}
            </div>
            {step.estimatedCredits > 0 && (
              <span className="flex shrink-0 items-center gap-1 self-start pt-0.5 text-[10px] text-text-secondary" title="Estimated credits">
                <Coins className="size-3" aria-hidden="true" />~{formatMillions(step.estimatedCredits)}
              </span>
            )}
          </li>
        ))}
      </ol>
      <div className={section}>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-text-secondary">Estimated total</span>
          <span className="flex items-center gap-1.5 text-sm font-medium text-text-primary">
            <Coins className="size-3.5" aria-hidden="true" />~{formatMillions(plan.totalCredits)} credits
          </span>
        </div>
        {plan.notes && <p className="mt-2 whitespace-pre-wrap text-xs italic text-text-secondary">{plan.notes}</p>}
      </div>
    </div>
  );
}

// A spend waiting for approval: each call with its tool's name and price, and the total.
function SpendSections({ spend }: { spend: CreditPayload }) {
  return (
    <div className="divide-y divide-line-tertiary">
      <div className={section}>
        <h3 className="text-sm font-semibold text-text-primary">Approve this spend?</h3>
        <p className="mt-1 text-sm leading-[22.75px] text-text-secondary">The next step costs more than runs without asking. Nothing is charged unless you approve.</p>
      </div>
      <ul aria-label="Calls" className={cn(section, "flex flex-col")}>
        {spend.calls.map((call) => (
          <li key={call.toolCallId} className="flex items-center gap-3 rounded-[10px] px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">{toolTitle(call.toolName)}</span>
            <span className="flex shrink-0 items-center gap-1 text-xs text-text-secondary">
              <Coins className="size-3" aria-hidden="true" />
              {formatMillions(call.credits)}
            </span>
          </li>
        ))}
      </ul>
      <div className={cn(section, "flex items-center justify-between gap-3")}>
        <span className="text-xs text-text-secondary">Total</span>
        <span className="flex items-center gap-1.5 text-sm font-medium text-text-primary">
          <Coins className="size-3.5" aria-hidden="true" />
          {formatMillions(spend.totalCredits)} credits
        </span>
      </div>
    </div>
  );
}

// Where Enter already means something (a button, a link, a field with text in it, a dialog), it isn't taken to
// answer. The composer left empty is free: it can't send while the run waits.
function enterIsFree(target: EventTarget | null) {
  if (!(target instanceof Element)) return true;
  if (target.closest("button, a[href], input, select, [contenteditable='true'], [role='button'], [role='menuitem'], [role='option'], [role='dialog']")) return false;
  if (target instanceof HTMLTextAreaElement) return target.value.trim() === "";
  return true;
}

// What the run waits for the user to answer, above the composer: a plan to run (Run All) or change, or a spend to
// approve or reject. Enter answers yes.
export function WaitpointCard({ chatId, waitpoint }: { chatId: string; waitpoint: PendingWaitpoint }) {
  const { respond, sending, error } = useRespondWaitpoint(chatId, waitpoint.id);
  const [changing, setChanging] = useState(false);
  const [feedback, setFeedback] = useState("");
  const isPlan = waitpoint.type === "plan";

  const approve = () => respond({ action: "approve" });
  const onEnter = useEffectEvent((event: KeyboardEvent) => {
    if (event.key !== "Enter" || event.shiftKey || event.altKey || event.metaKey || event.ctrlKey || event.isComposing) return;
    if (changing || !enterIsFree(event.target)) return;
    event.preventDefault();
    approve();
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onEnter(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  function submitChanges() {
    const text = feedback.trim();
    if (!text) return; // nothing said: nothing to send
    respond({ action: "request_changes", feedback: text });
  }

  function onFeedbackKey(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submitChanges();
    } else if (event.key === "Escape") {
      // back to the buttons; Escape goes no further (it would close the preview panel too)
      event.preventDefault();
      event.stopPropagation();
      setChanging(false);
    }
  }

  return (
    <section
      aria-label={isPlan ? "Plan" : "Spend approval"}
      className="flex max-h-[min(60vh,560px)] w-full flex-col overflow-hidden rounded-xl border border-line-tertiary bg-surface-main"
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        {waitpoint.type === "plan" ? <PlanSections plan={waitpoint.payload} /> : <SpendSections spend={waitpoint.payload} />}
      </div>
      {error && (
        <p role="alert" className="shrink-0 border-t border-line-tertiary px-5 py-2 text-xs text-destructive">
          {error}
        </p>
      )}
      {isPlan && changing ? (
        <div className={cn(section, "shrink-0 border-t border-line-tertiary")}>
          <textarea
            autoFocus
            rows={4}
            maxLength={FEEDBACK_MAX}
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            onKeyDown={onFeedbackKey}
            readOnly={sending}
            aria-label="Requested plan changes"
            placeholder={FEEDBACK_PLACEHOLDER}
            className="block w-full resize-none rounded-[10px] border border-[#d9d9d9] bg-surface-main px-3 py-2.5 text-sm leading-5 text-text-primary outline-none placeholder:text-text-tertiary focus-visible:ring-2 focus-visible:ring-[#8a8a8a] focus-visible:ring-offset-2 focus-visible:ring-offset-surface-main dark:border-line-secondary"
          />
          <div className="mt-2 flex items-center gap-2">
            <p className="flex items-center gap-1 text-[10px] text-text-tertiary [@media(hover:none)]:hidden">
              <kbd className={kbd}>⌘</kbd>
              <kbd className={kbd}>Enter</kbd>
              to submit changes
            </p>
            {/* no keyboard on a phone: the same two answers as buttons */}
            <div className="ml-auto hidden gap-2 [@media(hover:none)]:flex">
              <button type="button" onClick={() => setChanging(false)} className={outline}>
                Cancel
              </button>
              <button type="button" onClick={submitChanges} disabled={sending || !feedback.trim()} className={dark}>
                Submit changes
              </button>
            </div>
          </div>
        </div>
      ) : (
        <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line-tertiary px-5 py-3">
          <p className="mr-auto flex items-center gap-1 text-[10px] text-text-tertiary [@media(hover:none)]:hidden">
            <kbd className={kbd}>Enter</kbd>
            {isPlan ? "run all" : "approve"}
          </p>
          {isPlan ? (
            <>
              <button type="button" onClick={() => setChanging(true)} disabled={sending} className={outline}>
                <MessageSquare className="size-3" aria-hidden="true" />
                Request Changes
              </button>
              <button type="button" aria-disabled="true" title={INERT} className={outline}>
                <ListChecks className="size-3" aria-hidden="true" />
                Step by Step
              </button>
              <button type="button" onClick={approve} disabled={sending} className={dark}>
                <Play className="size-3" aria-hidden="true" />
                Run All
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => respond({ action: "reject" })} disabled={sending} className={outline}>
                <X className="size-3" aria-hidden="true" />
                Reject
              </button>
              <button type="button" onClick={approve} disabled={sending} className={dark}>
                <Check className="size-3" aria-hidden="true" />
                Approve
              </button>
            </>
          )}
        </footer>
      )}
    </section>
  );
}

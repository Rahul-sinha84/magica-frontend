"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles2Icon } from "@/components/icons";
import { useCredits } from "@/hooks/useCredits";
import { availableCredits, formatCredits } from "@/lib/utils";

// The pill in the top right of the chat header.
export function CreditsBadge() {
  const { data, isPending } = useCredits();

  if (isPending) return <Skeleton className="h-8 w-24 rounded-full" />;

  const available = data && availableCredits(data);
  const hasCredits = available === undefined || available > 0;
  const label = !hasCredits ? "Upgrade" : available !== undefined ? formatCredits(available) : "—";
  const description = !hasCredits
    ? "You are out of credits. Upgrade for more."
    : data
      ? `Credits available: ${label}`
      : "Credits are unavailable right now";

  return (
    <button
      type="button"
      aria-label={description}
      title={description}
      className="inline-flex h-8 items-center gap-2 rounded-full border-[0.5px] border-line-tertiary bg-surface-main-2 px-3 text-sm text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Sparkles2Icon className="size-3.5 shrink-0" />
      {label}
    </button>
  );
}

// The "Available Credits" line in the sidebar footer.
export function CreditsRow() {
  const { data } = useCredits();
  return (
    <div className="flex items-center justify-between px-2 text-xs">
      <span className="text-text-primary">Available Credits</span>
      <span className="font-medium text-text-secondary" aria-live="polite">
        {data ? formatCredits(availableCredits(data)) : "—"}
      </span>
    </div>
  );
}

"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

// magica's live "⌄ Thinking" row: shown while the model thinks and nothing else of the reply is on screen yet.
// It goes away once steps or text arrive, and a finished reply has no thinking row at all. Opening it shows
// what the model has reasoned so far, when the stream carries that.
export function TypingIndicator({ reasoning }: { reasoning?: string }) {
  const [open, setOpen] = useState(false);
  const canOpen = !!reasoning?.trim();
  return (
    <div role="status" aria-label="The assistant is thinking">
      <button
        type="button"
        aria-expanded={canOpen ? open : undefined}
        disabled={!canOpen}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded-md text-sm font-medium leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
      >
        {/* magica's chevron points down whether or not there is anything to open */}
        <ChevronDown className="size-4 text-text-secondary" aria-hidden="true" />
        <span className="thinking-shimmer">Thinking</span>
      </button>
      {canOpen && open && <p className="mt-2 whitespace-pre-wrap break-words pl-5 text-sm leading-6 text-text-secondary">{reasoning}</p>}
    </div>
  );
}

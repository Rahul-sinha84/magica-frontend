import { ChevronRight } from "lucide-react";

// The "Thinking" row shown while a reply is on its way.
export function TypingIndicator() {
  return (
    <div role="status" aria-label="The assistant is thinking" className="flex items-center gap-1 text-sm font-medium">
      <span className="thinking-shimmer">Thinking</span>
      <ChevronRight className="size-3.5 text-icon-secondary" aria-hidden="true" />
    </div>
  );
}

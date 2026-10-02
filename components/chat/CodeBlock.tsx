"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

// A fenced code block, as magica shows it: a header with the language and "Copy code", then the code.
export function CodeBlock({ language, code }: { language: string | null; code: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy to the clipboard");
    }
  }

  return (
    <div className="my-1 overflow-hidden rounded-2xl bg-surface-secondary">
      <div className="flex items-center justify-between bg-[#f5f5f7] px-3 py-2 dark:bg-surface-primary">
        <span className="font-mono text-base leading-7 capitalize text-text-secondary">{language ?? "code"}</span>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1 rounded-[4px] px-2 text-xs text-text-secondary outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-ring"
        >
          {copied ? <Check className="size-3" aria-hidden="true" /> : <Copy className="size-3" aria-hidden="true" />}
          {copied ? "Copied" : "Copy code"}
        </button>
      </div>
      <pre className="overflow-x-auto bg-[#f5f5f7] p-4 font-[family-name:var(--font-code)] text-sm leading-[21px] text-[#383a42] dark:bg-surface-primary dark:text-text-primary">
        <code>{code}</code>
      </pre>
    </div>
  );
}

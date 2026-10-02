"use client";

import type { ReactNode } from "react";
import { ClerkFailed, ClerkLoading } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";

export function AuthShell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <main
      aria-label={label}
      className="flex min-h-dvh items-center justify-center bg-black/[0.73] p-4"
    >
      <ClerkLoading>
        <Loader2 aria-label="Loading" className="size-6 animate-spin text-white/70" />
      </ClerkLoading>
      <ClerkFailed>
        <p
          role="alert"
          className="max-w-sm rounded-xl bg-surface-main-3 p-6 text-center text-sm"
        >
          We couldn&apos;t load the form. Check your connection, turn off any content blocker for
          this site, then reload the page.
        </p>
      </ClerkFailed>
      {children}
    </main>
  );
}

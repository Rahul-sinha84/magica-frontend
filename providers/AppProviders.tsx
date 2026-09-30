"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useClerk } from "@clerk/nextjs";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ThemeProvider } from "next-themes";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { makeQueryClient } from "@/lib/queryClient";

// The env check sits directly around the import so production builds drop the mock code.
async function loadMocks() {
  if (process.env.NEXT_PUBLIC_API_MOCKING !== "true") return;
  const { worker } = await import("@/tests/mocks/browser");
  await worker.start({ onUnhandledRequest: "bypass" });
}

// One shared start, because React Strict Mode runs the effect twice in development.
let mocksStarted: Promise<void> | undefined;
const startMocks = () => (mocksStarted ??= loadMocks());

export function AppProviders({ children }: { children: ReactNode }) {
  const clerk = useClerk();
  const [queryClient] = useState(() =>
    makeQueryClient({
      onUnauthorized: () =>
        toast.error("Your session has expired", {
          id: "session-expired",
          description: "Sign in again to continue.",
          action: { label: "Sign in", onClick: () => clerk.signOut({ redirectUrl: "/sign-in" }) },
        }),
    }),
  );
  // dev-only: serve the backend from in-browser mocks; children wait so no request slips through
  const [mocksReady, setMocksReady] = useState(process.env.NEXT_PUBLIC_API_MOCKING !== "true");

  useEffect(() => {
    if (mocksReady) return;
    let cancelled = false;
    // if the worker can't start, fall through to the real backend instead of a blank app
    startMocks()
      .catch((error) => console.error("Could not start the mock backend", error))
      .then(() => !cancelled && setMocksReady(true));
    return () => {
      cancelled = true;
    };
  }, [mocksReady]);

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>{mocksReady ? children : null}</TooltipProvider>
        <Toaster />
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </ThemeProvider>
  );
}

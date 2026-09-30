"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useClerk } from "@clerk/nextjs";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ThemeProvider, useTheme } from "next-themes";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { makeQueryClient } from "@/lib/queryClient";
import { AccountBoundary } from "./AccountBoundary";

// The env check sits directly around the import so production builds drop the mock code.
async function loadMocks() {
  if (process.env.NEXT_PUBLIC_API_MOCKING !== "true") return;
  const { worker } = await import("@/tests/mocks/browser");
  // quiet: without it every mocked request is logged to the console
  await worker.start({ onUnhandledRequest: "bypass", quiet: true });
}

// A theme value that isn't one of ours (an old or edited localStorage entry) would leave a stray class
// on <html> and no toggle selected, so it is reset to the default.
const THEMES = ["light", "dark", "system"];
function ThemeGuard() {
  const { theme, setTheme } = useTheme();
  useEffect(() => {
    if (theme && !THEMES.includes(theme)) setTheme("light");
  }, [theme, setTheme]);
  return null;
}

// The query devtools save their state in localStorage and crash the page when it is blocked (private
// windows, "block all site data"), so they only load where storage works. Development only.
function storageWorks() {
  try {
    localStorage.setItem("__probe", "1");
    localStorage.removeItem("__probe");
    return true;
  } catch {
    return false;
  }
}

let devtoolsAllowed: boolean | undefined;
const showDevtools = () => (devtoolsAllowed ??= process.env.NODE_ENV === "development" && storageWorks());
const noSubscription = () => () => {};

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
  // false on the server and in the first client render (so they match), then the real answer
  const devtools = useSyncExternalStore(noSubscription, showDevtools, () => false);
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
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem themes={["light", "dark"]}>
      <ThemeGuard />
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>{mocksReady ? children : null}</TooltipProvider>
        {/* after the children, so its check runs once the pages have read their saved drafts back */}
        <AccountBoundary />
        <Toaster />
        {devtools && <ReactQueryDevtools initialIsOpen={false} />}
      </QueryClientProvider>
    </ThemeProvider>
  );
}

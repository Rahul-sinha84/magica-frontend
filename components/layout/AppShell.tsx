"use client";

import { useEffect, type ReactNode } from "react";
import { useUiStore } from "@/stores/uiStore";
import { ArtifactPanel } from "@/components/chat/ArtifactPanel";
import { Sidebar } from "./Sidebar";
import { SessionGuard } from "./SessionGuard";

export function AppShell({ children }: { children: ReactNode }) {
  // restore the remembered sidebar state after hydration (see uiStore). With storage blocked
  // (private mode, "block all site data") zustand leaves `persist` undefined, so guard it.
  useEffect(() => {
    useUiStore.persist?.rehydrate();
  }, []);

  return (
    <div className="flex h-dvh gap-2 overflow-hidden bg-background md:p-2">
      <Sidebar />
      <main className="flex min-w-0 flex-1 overflow-hidden bg-background md:rounded-3xl">{children}</main>
      <ArtifactPanel />
      <SessionGuard />
    </div>
  );
}

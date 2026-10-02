"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import { DRAFTS_KEY, useChatStore } from "@/stores/chatStore";

// Who the drafts in this tab's session storage belong to.
export const DRAFTS_OWNER_KEY = "magica-drafts-owner";

function storage(action: (s: Storage) => void) {
  try {
    action(sessionStorage);
  } catch {
    // storage blocked: there is nothing saved to protect
  }
}

function readOwner() {
  try {
    return sessionStorage.getItem(DRAFTS_OWNER_KEY);
  } catch {
    return null;
  }
}

// One person's data must never be shown to the next. Signing out and signing in as someone else happens
// without a page reload, so the cached tasks, messages, runs and drafts are all dropped the moment the
// signed-in account changes. Drafts saved in this tab by another account are dropped on load, too.
export function AccountBoundary() {
  const { isLoaded, userId } = useAuth();
  const queryClient = useQueryClient();
  // the account this tab last saw; undefined until Clerk has loaded once
  const seen = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!isLoaded) return;
    const current = userId ?? null;
    const changed = seen.current !== undefined && seen.current !== current;
    const owner = readOwner();
    const foreignDrafts = seen.current === undefined && current !== null && owner !== null && owner !== current;

    if (changed || foreignDrafts) {
      if (changed) queryClient.clear();
      useChatStore.setState(useChatStore.getInitialState(), true);
      storage((s) => s.removeItem(DRAFTS_KEY));
    }
    if (current) storage((s) => s.setItem(DRAFTS_OWNER_KEY, current));
    seen.current = current;
  }, [isLoaded, userId, queryClient]);

  return null;
}

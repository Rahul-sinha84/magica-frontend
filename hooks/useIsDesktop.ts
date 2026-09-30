"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(min-width: 768px)";

const subscribe = (onChange: () => void) => {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};

// true on the server, so the desktop layout is what gets server-rendered
export function useIsDesktop() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => true);
}

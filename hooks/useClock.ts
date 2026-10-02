"use client";

import { useSyncExternalStore } from "react";

const subscribe = (onChange: () => void) => {
  const id = setInterval(onChange, 15_000);
  return () => clearInterval(id);
};

const currentMinute = () => Math.floor(Date.now() / 60_000);

// The current time to the minute, or null during server rendering (the server's clock and
// timezone are not the viewer's, so rendering it there would always mismatch).
export function useClock() {
  const minute = useSyncExternalStore(subscribe, currentMinute, () => null);
  return minute === null ? null : new Date(minute * 60_000);
}

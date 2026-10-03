"use client";

import { useEffect, useState } from "react";

// The value once it has stopped changing for `ms` (a search box, while someone types).
export function useDebounced<T>(value: T, ms: number) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

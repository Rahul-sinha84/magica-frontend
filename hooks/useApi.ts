"use client";

import { useMemo } from "react";
import { useAuth } from "@clerk/nextjs";
import { createApi } from "@/lib/api";

export function useApi() {
  const { getToken } = useAuth();
  return useMemo(() => createApi(getToken), [getToken]);
}

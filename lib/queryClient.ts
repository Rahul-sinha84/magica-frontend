import { MutationCache, QueryCache, QueryClient, onlineManager } from "@tanstack/react-query";
import type { ErrorCode } from "@/contracts";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
    // the backend's machine-readable reason (for example "RUN_ACTIVE"); undefined for errors that
    // never came from it, such as a network failure
    public code?: ErrorCode,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const NO_RETRY_STATUSES = [401, 403, 404];

interface Options {
  // called when the backend still says 401 after a fresh-token retry
  onUnauthorized?: () => void;
}

export function makeQueryClient({ onUnauthorized }: Options = {}) {
  const onError = (error: Error) => {
    if (error instanceof ApiError && error.status === 401) onUnauthorized?.();
  };

  return new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      // Try the request even when the browser says it is offline. The default would pause it and
      // leave the screen on a loading state for as long as the connection is down.
      queries: {
        networkMode: "offlineFirst",
        staleTime: 30_000,
        retry: (failureCount, error) =>
          onlineManager.isOnline() &&
          !(error instanceof ApiError && NO_RETRY_STATUSES.includes(error.status)) &&
          failureCount < 2,
      },
      mutations: { networkMode: "offlineFirst", retry: 0 },
    },
  });
}

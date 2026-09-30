import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
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
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) =>
          !(error instanceof ApiError && NO_RETRY_STATUSES.includes(error.status)) &&
          failureCount < 2,
      },
      mutations: { retry: 0 },
    },
  });
}

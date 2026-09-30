import { QueryClient } from "@tanstack/react-query";

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

export function makeQueryClient() {
  return new QueryClient({
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

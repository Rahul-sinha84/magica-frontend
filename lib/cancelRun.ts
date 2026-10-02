import type { Api } from "./api";
import { ApiError } from "./queryClient";

// Cancels a run. A 4xx means it was already over, which is not a failure; anything else is thrown.
export async function cancelRun(api: Api, runId: string) {
  try {
    await api.runs.cancel(runId);
  } catch (error) {
    const refused = error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 401;
    if (!refused) throw error;
  }
}

import { afterEach, describe, expect, it, vi } from "vitest";
import { onlineManager } from "@tanstack/react-query";
import { ApiError, makeQueryClient } from "@/lib/queryClient";

function shouldRetry(error: Error, failureCount: number) {
  const retry = makeQueryClient().getDefaultOptions().queries?.retry;
  if (typeof retry !== "function") throw new Error("retry should be a function");
  return retry(failureCount, error);
}

describe("query retry policy", () => {
  it.each([401, 403, 404])("never retries a %i", (status) => {
    expect(shouldRetry(new ApiError(status, "nope"), 0)).toBe(false);
  });

  it("retries server errors twice, then gives up", () => {
    const error = new ApiError(500, "boom");
    expect(shouldRetry(error, 0)).toBe(true);
    expect(shouldRetry(error, 1)).toBe(true);
    expect(shouldRetry(error, 2)).toBe(false);
  });

  it("retries network failures (status 0)", () => {
    expect(shouldRetry(new ApiError(0, "offline"), 0)).toBe(true);
  });

  it("retries unexpected non-API errors a limited number of times", () => {
    expect(shouldRetry(new Error("unknown"), 1)).toBe(true);
    expect(shouldRetry(new Error("unknown"), 2)).toBe(false);
  });

  it("does not retry mutations", () => {
    expect(makeQueryClient().getDefaultOptions().mutations?.retry).toBe(0);
  });

  it("gives every caller its own client", () => {
    expect(makeQueryClient()).not.toBe(makeQueryClient());
  });

  describe("when the backend keeps rejecting the session", () => {
    it("calls onUnauthorized for a 401 from a query", async () => {
      const onUnauthorized = vi.fn();
      const client = makeQueryClient({ onUnauthorized });
      await client
        .fetchQuery({ queryKey: ["x"], queryFn: () => Promise.reject(new ApiError(401, "no")), retry: false })
        .catch(() => {});
      expect(onUnauthorized).toHaveBeenCalledOnce();
    });

    it("calls onUnauthorized for a 401 from a mutation", async () => {
      const onUnauthorized = vi.fn();
      const client = makeQueryClient({ onUnauthorized });
      await client
        .getMutationCache()
        .build(client, { mutationFn: () => Promise.reject(new ApiError(401, "no")) })
        .execute(undefined)
        .catch(() => {});
      expect(onUnauthorized).toHaveBeenCalledOnce();
    });

    it("ignores other failures", async () => {
      const onUnauthorized = vi.fn();
      const client = makeQueryClient({ onUnauthorized });
      await client
        .fetchQuery({ queryKey: ["y"], queryFn: () => Promise.reject(new ApiError(500, "boom")), retry: false })
        .catch(() => {});
      expect(onUnauthorized).not.toHaveBeenCalled();
    });
  });

  describe("when the browser is offline", () => {
    afterEach(() => onlineManager.setOnline(true));

    it("tries the request anyway instead of waiting on a loading state forever", () => {
      const defaults = makeQueryClient().getDefaultOptions();
      expect(defaults.queries?.networkMode).toBe("offlineFirst");
      expect(defaults.mutations?.networkMode).toBe("offlineFirst");
    });

    it("reports the failure instead of pausing to retry", () => {
      onlineManager.setOnline(false);
      expect(shouldRetry(new ApiError(0, "offline"), 0)).toBe(false);
    });

    it("goes back to retrying once the connection is back", () => {
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);
      expect(shouldRetry(new ApiError(0, "blip"), 0)).toBe(true);
    });
  });
});

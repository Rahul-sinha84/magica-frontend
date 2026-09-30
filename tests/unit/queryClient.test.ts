import { describe, expect, it } from "vitest";
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
});

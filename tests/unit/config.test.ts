import { afterEach, describe, expect, it, vi } from "vitest";

async function backendUrl(value: string | undefined) {
  vi.resetModules();
  if (value === undefined) vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", undefined);
  else vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", value);
  return (await import("@/lib/config")).BACKEND_URL;
}

afterEach(() => vi.unstubAllEnvs());

describe("BACKEND_URL", () => {
  it("defaults to the local backend", async () => {
    expect(await backendUrl(undefined)).toBe("http://localhost:3000");
  });

  it("falls back when the variable is present but empty", async () => {
    expect(await backendUrl("")).toBe("http://localhost:3000");
  });

  it("drops trailing slashes so paths don't end up as //api", async () => {
    expect(await backendUrl("https://api.example.com/")).toBe("https://api.example.com");
    expect(await backendUrl("https://api.example.com///")).toBe("https://api.example.com");
  });

  it("keeps a path prefix", async () => {
    expect(await backendUrl("https://example.com/backend/")).toBe("https://example.com/backend");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { uuid } from "@/lib/uuid";

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
afterEach(() => vi.unstubAllGlobals());

describe("uuid", () => {
  it("makes a v4 id", () => {
    expect(uuid()).toMatch(V4);
  });

  it("still works where randomUUID is missing (insecure contexts, older browsers)", () => {
    const real = crypto;
    vi.stubGlobal("crypto", { getRandomValues: (a: Uint8Array) => real.getRandomValues(a) });
    const a = uuid();
    expect(a).toMatch(V4);
    expect(uuid()).not.toBe(a);
  });
});

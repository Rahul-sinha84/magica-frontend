import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("joins class names and skips falsy values", () => {
    expect(cn("a", false, undefined, "b")).toBe("a b");
  });

  it("lets later tailwind classes win", () => {
    expect(cn("p-4", "p-2")).toBe("p-2");
  });
});

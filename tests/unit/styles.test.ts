import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("global styles", () => {
  it("do not depend on the inside of Clerk's components, which Clerk changes without notice", () => {
    const css = readFileSync(resolve(__dirname, "../../app/globals.css"), "utf8");
    expect(css).not.toMatch(/\.cl-/);
  });
});

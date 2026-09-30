import { describe, expect, it } from "vitest";
import { cn, formatClockTime, formatCredits, isTerminalStatus, truncate } from "@/lib/utils";

describe("cn", () => {
  it("joins class names and skips falsy values", () => {
    expect(cn("a", false, undefined, "b")).toBe("a b");
  });

  it("lets later tailwind classes win", () => {
    expect(cn("p-4", "p-2")).toBe("p-2");
  });
});

describe("truncate", () => {
  it("leaves short text alone", () => {
    expect(truncate("Hello", 10)).toBe("Hello");
    expect(truncate("Hello", 5)).toBe("Hello");
  });

  it("cuts long text and adds an ellipsis", () => {
    expect(truncate("Hello world", 5)).toBe("Hello...");
  });

  it("never cuts an emoji in half", () => {
    expect(truncate("😀😀😀", 2)).toBe("😀😀...");
    expect(truncate("👨‍👩‍👧‍👦 family", 1)).toBe("👨‍👩‍👧‍👦...");
    expect(truncate("🇮🇳🇮🇳", 1)).toBe("🇮🇳...");
  });

  it("counts an emoji as one character when deciding to cut", () => {
    expect(truncate("😀😀😀", 3)).toBe("😀😀😀");
  });
});

describe("formatCredits", () => {
  it("shows large balances in millions, as magica does", () => {
    expect(formatCredits(29_660_000)).toBe("29.66M");
    expect(formatCredits(290_000)).toBe("0.29M");
    expect(formatCredits(70_000)).toBe("0.07M");
  });

  it("shows small amounts as whole numbers", () => {
    expect(formatCredits(9_500)).toBe("9,500");
    expect(formatCredits(0)).toBe("0");
  });

  it("does not print NaN or Infinity for a bad value", () => {
    expect(formatCredits(Number.NaN)).toBe("—");
    expect(formatCredits(Number.POSITIVE_INFINITY)).toBe("—");
  });

  it("never prints a negative zero", () => {
    expect(formatCredits(-0.4)).toBe("0");
    expect(formatCredits(-0)).toBe("0");
  });

  it("handles a negative balance", () => {
    expect(formatCredits(-290_000)).toBe("-0.29M");
    expect(formatCredits(-50)).toBe("-50");
  });
});

describe("formatClockTime", () => {
  it("formats as h:mm AM/PM in the local timezone", () => {
    expect(formatClockTime(new Date(2026, 8, 30, 14, 42).toISOString())).toBe("2:42 PM");
    expect(formatClockTime(new Date(2026, 8, 30, 0, 5).toISOString())).toBe("12:05 AM");
  });

  it("returns nothing for an unreadable date", () => {
    expect(formatClockTime("not a date")).toBe("");
  });
});

describe("isTerminalStatus", () => {
  it("is true for finished runs and finished streams", () => {
    for (const status of ["COMPLETED", "FAILED", "CANCELLED", "complete", "failed", "cancelled"] as const) {
      expect(isTerminalStatus(status)).toBe(true);
    }
  });

  it("is false while work is still going", () => {
    for (const status of ["PENDING", "RUNNING", "thinking", "streaming", "calling-tool", "stopping"] as const) {
      expect(isTerminalStatus(status)).toBe(false);
    }
  });
});

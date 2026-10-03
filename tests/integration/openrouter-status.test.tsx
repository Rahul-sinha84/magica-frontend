import { screen, waitFor } from "@testing-library/react";
import { delay, http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { Composer } from "@/components/composer/Composer";
import { BACKEND_URL } from "@/lib/config";
import type { ModelHealth } from "@/types";
import { getMockDb } from "../mocks/fixtures";
import { server } from "../mocks/server";
import { renderApp } from "../utils/render";

const status = () => screen.getByLabelText(/^OpenRouter Free/);
const dotOf = (el: HTMLElement) => el.querySelector("span[aria-hidden]")!;

function setHealth(health: ModelHealth, lastRoutedModel: string | null = "meta-llama/llama-3.3-70b-instruct:free", reason: string | null = null) {
  getMockDb().models.status = { health, lastRoutedModel, reason, checkedAt: new Date().toISOString() };
}

const DAILY_LIMIT = "The free model's daily limit is reached. It resets at 00:00 UTC.";

function renderComposer() {
  const onSubmit = vi.fn();
  const view = renderApp(<Composer value="hello" onChange={() => {}} onSubmit={onSubmit} placeholder="Send a message…" />);
  return { ...view, onSubmit };
}

async function tooltipText(user: ReturnType<typeof renderComposer>["user"]) {
  await user.hover(status());
  return (await screen.findByRole("tooltip")).textContent ?? "";
}

describe("the OpenRouter Free status", () => {
  const cases: [ModelHealth, string, string, string | null][] = [
    ["available", "available", "bg-[#22c55e]", null],
    ["degraded", "busy", "bg-[#f59e0b]", "Free models are busy right now, so replies may be slow."],
    ["unavailable", "not answering", "bg-[#ef4444]", "Free models aren't answering right now. You can still send; it may fail."],
    ["unknown", "status unknown", "bg-text-disabled", null],
  ];

  for (const [health, label, dot, note] of cases) {
    it(`shows ${health} with the right dot and tooltip`, async () => {
      setHealth(health);
      const { user } = renderComposer();
      await waitFor(() => expect(status()).toHaveAttribute("data-health", health));
      expect(status()).toHaveAccessibleName(`OpenRouter Free, ${label}`);
      expect(dotOf(status())).toHaveClass(dot);
      const text = await tooltipText(user);
      expect(text).toContain("Free model");
      expect(text).toContain("Last answered by meta-llama/llama-3.3-70b-instruct:free");
      if (note) expect(text).toContain(note);
      else expect(text).not.toMatch(/busy|aren't answering/);
    });
  }

  it("leaves out 'Last answered by' when no model has answered yet", async () => {
    setHealth("available", null);
    const { user } = renderComposer();
    await waitFor(() => expect(status()).toHaveAttribute("data-health", "available"));
    expect(await tooltipText(user)).not.toContain("Last answered by");
  });

  it("adds the server's reason as its own line when there is one", async () => {
    setHealth("unavailable", "meta-llama/llama-3.3-70b-instruct:free", DAILY_LIMIT);
    const { user } = renderComposer();
    await waitFor(() => expect(status()).toHaveAttribute("data-health", "unavailable"));
    await user.hover(status());
    const tooltip = await screen.findByRole("tooltip");
    const lines = [...tooltip.querySelectorAll("p")].map((p) => p.textContent);
    expect(lines).toContain(DAILY_LIMIT);
    // styled like the other lines: a paragraph of its own in the same stack
    expect(lines.at(-1)).toBe(DAILY_LIMIT);
  });

  it("has no reason line when the server gives none", async () => {
    setHealth("unavailable");
    const { user } = renderComposer();
    await waitFor(() => expect(status()).toHaveAttribute("data-health", "unavailable"));
    await user.hover(status());
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).not.toHaveTextContent("daily limit");
    expect([...tooltip.querySelectorAll("p")].map((p) => p.textContent)).toEqual([
      "Free model",
      "Last answered by meta-llama/llama-3.3-70b-instruct:free",
      "Free models aren't answering right now. You can still send; it may fail.",
    ]);
  });

  it("opens on keyboard focus too", async () => {
    const { user } = renderComposer();
    await waitFor(() => expect(status()).toHaveAttribute("data-health", "available"));
    status().focus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Free model");
    void user;
  });

  it("is grey (unknown) while loading", async () => {
    server.use(http.get(`${BACKEND_URL}/api/models`, async () => {
      await delay("infinite");
      return HttpResponse.json({});
    }));
    renderComposer();
    expect(status()).toHaveAttribute("data-health", "unknown");
    expect(dotOf(status())).toHaveClass("bg-text-disabled");
  });

  it("is grey (unknown) when the request fails, and the composer still sends", async () => {
    server.use(http.get(`${BACKEND_URL}/api/models`, () => HttpResponse.json({ error: "down", code: "INTERNAL_ERROR" }, { status: 500 })));
    const { user, onSubmit } = renderComposer();
    await new Promise((r) => setTimeout(r, 100));
    expect(status()).toHaveAttribute("data-health", "unknown");
    await user.click(screen.getByRole("button", { name: "Send message" }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("never blocks sending, even when the model isn't answering", async () => {
    setHealth("unavailable");
    const { user, onSubmit } = renderComposer();
    await waitFor(() => expect(status()).toHaveAttribute("data-health", "unavailable"));
    expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Send message" }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("rejects a response that doesn't match the contract (reads as unknown)", async () => {
    server.use(http.get(`${BACKEND_URL}/api/models`, () => HttpResponse.json({ models: [], status: { health: "great" } })));
    renderComposer();
    await new Promise((r) => setTimeout(r, 100));
    expect(status()).toHaveAttribute("data-health", "unknown");
  });
});

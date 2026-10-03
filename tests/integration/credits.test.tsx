import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { CreditsBadge } from "@/components/credits/CreditsBadge";
import { BACKEND_URL } from "@/lib/config";
import { server } from "../mocks/server";
import { renderApp } from "../utils/render";

const credits = (body: unknown, status = 200) =>
  http.get(`${BACKEND_URL}/api/credits`, () => HttpResponse.json(body as object, { status }));

describe("credits pill", () => {
  it("shows the balance in millions", async () => {
    renderApp(<CreditsBadge />);
    const pill = await screen.findByRole("button", { name: "Credits available: 29.66M" });
    expect(pill).toHaveTextContent("29.66M");
  });

  it("shows small balances as plain numbers", async () => {
    server.use(credits({ balance: 4200, held: 0 }));
    renderApp(<CreditsBadge />);
    expect(await screen.findByRole("button", { name: "Credits available: 4,200" })).toBeInTheDocument();
  });

  it("shows what can still be spent, not the raw balance", async () => {
    server.use(credits({ balance: 10_000_000, held: 3_000_000 }));
    renderApp(<CreditsBadge />);
    // as magica writes it, with no trailing zeros
    expect(await screen.findByRole("button", { name: "Credits available: 7M" })).toHaveTextContent("7M");
  });

  it("asks you to upgrade when everything left is reserved by a run in flight", async () => {
    server.use(credits({ balance: 5_000_000, held: 5_000_000 }));
    renderApp(<CreditsBadge />);
    expect(await screen.findByRole("button", { name: /out of credits/i })).toHaveTextContent("Upgrade");
  });

  it.each([0, -50])("asks you to upgrade at a balance of %i", async (balance) => {
    server.use(credits({ balance, held: 0 }));
    renderApp(<CreditsBadge />);
    expect(await screen.findByRole("button", { name: /out of credits/i })).toHaveTextContent("Upgrade");
  });

  it("shows a dash, not a wrong number, when the balance can't be loaded", async () => {
    server.use(credits({ error: "down" }, 500));
    renderApp(<CreditsBadge />);
    const pill = await screen.findByRole("button", { name: "Credits are unavailable right now" });
    expect(pill).toHaveTextContent("—");
  });

  it("shows a placeholder while loading, not a flash of zero", () => {
    renderApp(<CreditsBadge />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("follows the balance when it changes", async () => {
    const { client } = renderApp(<CreditsBadge />);
    await screen.findByRole("button", { name: "Credits available: 29.66M" });

    server.use(credits({ balance: 29_370_000, held: 0 }));
    await client.invalidateQueries({ queryKey: ["credits"] });

    await waitFor(() => expect(screen.getByRole("button")).toHaveTextContent("29.37M"));
  });
});

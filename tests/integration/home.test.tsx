import { QueryClientProvider } from "@tanstack/react-query";
import { screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomeScreen } from "@/components/chat/HomeScreen";
import { makeQueryClient } from "@/lib/queryClient";
import { renderApp } from "../utils/render";

afterEach(() => vi.useRealTimers());

describe("home screen", () => {
  it("greets with magica's copy", () => {
    renderApp(<HomeScreen />);
    expect(screen.getByRole("heading", { name: "Your AI worker" })).toBeInTheDocument();
    expect(screen.getByText("Work at the speed of thought.")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Assign a task or ask anything…")).toHaveFocus();
  });

  it("shows the viewer's local time", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 30, 16, 45));
    renderApp(<HomeScreen />);
    expect(await screen.findByText("4:45")).toBeInTheDocument();
    expect(screen.getByText("PM")).toBeInTheDocument();
  });

  it("does not print the server's clock, which would never match the viewer's", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 30, 16, 45));
    const html = renderToString(
      <QueryClientProvider client={makeQueryClient()}>
        <HomeScreen />
      </QueryClientProvider>,
    );
    expect(html).toContain("Your AI worker");
    expect(html).not.toContain("4:45");
    expect(html).not.toContain(">PM<");
  });

  it("lets you type, including several lines", async () => {
    const { user } = renderApp(<HomeScreen />);
    const box = screen.getByRole("textbox");
    await user.type(box, "first{Enter}second");
    expect(box).toHaveValue("first\nsecond");
  });

  it("can't send yet, even with text", async () => {
    const { user } = renderApp(<HomeScreen />);
    await user.type(screen.getByRole("textbox"), "hello");
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
  });

  it("shows the balance in the header and no files button", async () => {
    renderApp(<HomeScreen />);
    expect(await screen.findByRole("button", { name: "Credits available: 29.66M" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View all files in this task" })).not.toBeInTheDocument();
  });

  it("names the model in the header", () => {
    renderApp(<HomeScreen />);
    expect(screen.getByRole("button", { name: /Magica Auto/ })).toBeInTheDocument();
  });

  it("lets the model name shrink on a narrow phone instead of wrapping", () => {
    renderApp(<HomeScreen />);
    expect(screen.getByText("Magica Auto")).toHaveClass("truncate");
  });
});

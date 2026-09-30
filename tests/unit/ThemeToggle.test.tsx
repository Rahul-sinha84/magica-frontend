import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "next-themes";
import { beforeEach, describe, expect, it } from "vitest";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

function renderToggle() {
  return render(
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <ThemeToggle />
    </ThemeProvider>,
  );
}

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
  });

  it("starts on the light theme", () => {
    renderToggle();
    expect(screen.getByRole("radio", { name: "Light theme" })).toBeChecked();
  });

  it("switches to dark and back", async () => {
    const user = userEvent.setup();
    renderToggle();

    await user.click(screen.getByRole("radio", { name: "Dark theme" }));
    expect(document.documentElement).toHaveClass("dark");
    expect(screen.getByRole("radio", { name: "Dark theme" })).toBeChecked();

    await user.click(screen.getByRole("radio", { name: "Light theme" }));
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("remembers the choice across a reload", async () => {
    const user = userEvent.setup();
    const { unmount } = renderToggle();
    await user.click(screen.getByRole("radio", { name: "Dark theme" }));
    unmount();

    renderToggle();
    expect(screen.getByRole("radio", { name: "Dark theme" })).toBeChecked();
  });
});

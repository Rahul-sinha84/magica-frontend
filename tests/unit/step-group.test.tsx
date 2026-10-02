import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { StepGroup } from "@/components/chat/StepGroup";
import type { ToolCallBlock } from "@/types";

const step = (id: string, toolName: string, status: ToolCallBlock["status"]): ToolCallBlock => ({
  type: "tool_call", toolCallId: id, toolName, toolInput: { name: "image-editing" }, status, durationMs: status === "completed" ? 13 : undefined,
});
const results = new Map();
const header = () => screen.getByRole("button", { name: /steps?/ });

describe("the step list while the agent works", () => {
  it("opens when a running step arrives after one that finished at once", () => {
    const loaded = step("s1", "load_skill", "completed");
    const { rerender } = render(<StepGroup calls={[loaded]} results={results} />);
    expect(header()).toHaveAttribute("aria-expanded", "false");

    rerender(<StepGroup calls={[loaded, step("s2", "gpt_image_2", "running")]} results={results} />);
    expect(header()).toHaveAccessibleName(/Working · 2 steps/);
    expect(header()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("GPT Image 2")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Running" })).toBeInTheDocument();
  });

  it("in a reply being written, stays open and Working between one step and the next", () => {
    render(<StepGroup calls={[step("s1", "load_skill", "completed")]} results={results} ongoing />);
    expect(header()).toHaveAccessibleName(/Working · 1 step/);
    expect(header()).toHaveAttribute("aria-expanded", "true");
  });

  it("stays closed when the reader closed it while the agent was working", async () => {
    const user = userEvent.setup();
    const first = step("s1", "load_skill", "running");
    const { rerender } = render(<StepGroup calls={[first]} results={results} />);
    expect(header()).toHaveAttribute("aria-expanded", "true");
    await user.click(header());
    expect(header()).toHaveAttribute("aria-expanded", "false");

    // the first step finishes and the next one starts: still closed, as the reader left it
    const done = step("s1", "load_skill", "completed");
    rerender(<StepGroup calls={[done]} results={results} />);
    rerender(<StepGroup calls={[done, step("s2", "gpt_image_2", "running")]} results={results} />);
    expect(header()).toHaveAttribute("aria-expanded", "false");
  });

  it("folds away when the work is over", () => {
    const loaded = step("s1", "load_skill", "completed");
    const { rerender } = render(<StepGroup calls={[loaded, step("s2", "gpt_image_2", "running")]} results={results} ongoing />);
    expect(header()).toHaveAttribute("aria-expanded", "true");

    rerender(<StepGroup calls={[loaded, step("s2", "gpt_image_2", "completed")]} results={results} />);
    expect(header()).toHaveAccessibleName(/Completed 2 steps/);
    expect(header()).toHaveAttribute("aria-expanded", "false");
  });
});

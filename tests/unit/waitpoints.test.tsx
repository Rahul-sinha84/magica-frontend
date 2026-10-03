import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MessageContent } from "@/components/chat/MessageContent";
import type { CreditPayload, PlanPayload, Waitpoint, WaitpointBlock, WaitpointStatus } from "@/contracts";
import { formatMillions, waitingOn } from "@/lib/waitpoints";
import type { ContentBlock } from "@/types";

const PLAN: PlanPayload = {
  title: "A fox, then a crop",
  overview: "Generate a fox, then crop it.",
  steps: [
    { title: "Generate the fox", tool: "gpt_image_2", estimatedCredits: 68_700 },
    { title: "Crop it", tool: "crop_image", estimatedCredits: 5_000 },
  ],
  totalCredits: 73_700,
};
const SPEND: CreditPayload = { calls: [{ toolCallId: "s3-a", toolName: "gpt_image_2", credits: 70_000 }], totalCredits: 70_000 };
const EXPIRES = "2026-10-02T12:30:00.000Z";

const planBlock = (status: WaitpointStatus, over: Partial<WaitpointBlock> = {}): WaitpointBlock =>
  ({ type: "waitpoint", waitpointId: "wp-1", waitpointType: "plan", payload: PLAN, expiresAt: EXPIRES, status, ...over }) as WaitpointBlock;
const spendBlock = (status: WaitpointStatus, over: Partial<WaitpointBlock> = {}): WaitpointBlock =>
  ({ type: "waitpoint", waitpointId: "wp-2", waitpointType: "credit", payload: SPEND, expiresAt: EXPIRES, status, ...over }) as WaitpointBlock;
const serverWaitpoint = (id: string): Waitpoint => ({
  id, runId: "run-1", type: "plan", status: "pending", feedback: null, expiresAt: EXPIRES, createdAt: EXPIRES, resolvedAt: null, payload: PLAN,
});

const view = (blocks: ContentBlock[]) => render(<MessageContent blocks={blocks} chatId="c1" />);

describe("waitpoints in a saved reply", () => {
  // the key/value table a step opens to: each label with its value
  const table = () => screen.getAllByText(/^(Title|Overview|Step \d+|Total estimated|Notes|Call \d+|Total)$/).map((label) => [label.textContent, label.nextElementSibling?.textContent]);

  it("an approved plan: 'Plan approved', a check, a clock and how long it waited, laid out like a tool step", async () => {
    view([planBlock("approved", { waitedMs: 76_000 })]);
    const row = screen.getByRole("button", { name: /Plan approved/ });
    expect(row).toHaveTextContent(/^Plan approved1m 16s$/); // no "·" between them
    expect(within(row).getByRole("img", { name: "Approved" })).toBeInTheDocument();
    expect(row).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(PLAN.title)).not.toBeInTheDocument();
  });

  it("opens to the tool steps' key/value table: title, overview, each step with its cost, the total and notes", async () => {
    view([
      planBlock("approved", {
        waitedMs: 76_000,
        payload: { ...PLAN, steps: [{ ...PLAN.steps[0], description: "A realistic fox in a forest." }, PLAN.steps[1]], notes: "Generated first, then cropped." },
      }),
    ]);
    const row = screen.getByRole("button", { name: /Plan approved/ });
    await userEvent.click(row);
    expect(row).toHaveAttribute("aria-expanded", "true");
    expect(table()).toEqual([
      ["Title", PLAN.title],
      ["Overview", PLAN.overview],
      ["Step 1", "Generate the fox (~0.0687M)\nA realistic fox in a forest."],
      ["Step 2", "Crop it (~0.005M)"],
      ["Total estimated", "~0.0737M credits"],
      ["Notes", "Generated first, then cropped."],
    ]);
    // a past plan has nothing to answer
    expect(screen.queryByRole("button", { name: "Run All" })).not.toBeInTheDocument();
  });

  it("cuts long content off, as the tool steps do", async () => {
    view([planBlock("approved", { payload: { ...PLAN, overview: "x".repeat(2500) } })]);
    await userEvent.click(screen.getByRole("button", { name: /Plan approved/ }));
    const overview = screen.getByText("Overview").nextElementSibling!.textContent!;
    expect(overview).toHaveLength(2001);
    expect(overview.endsWith("…")).toBe(true);
  });

  it("changes requested, with what was asked for", () => {
    view([planBlock("changes_requested", { feedback: "make it a red fox", waitedMs: 12_000 })]);
    expect(screen.getByRole("button", { name: /Changes requested/ })).toHaveTextContent(/^Changes requested12\.0s$/);
    expect(screen.getByText("“make it a red fox”")).toBeInTheDocument();
  });

  it("a spend approved, and one declined; opening it shows the calls", async () => {
    view([spendBlock("approved", { waitedMs: 2000 }), spendBlock("rejected", { waitpointId: "wp-3", waitedMs: 3000 })]);
    expect(screen.getByRole("button", { name: /Spend approved/ })).toBeInTheDocument();
    const declined = screen.getByRole("button", { name: /Spend declined/ });
    await userEvent.click(declined);
    expect(table()).toEqual([
      ["Call 1", "GPT Image 2 (0.07M)"],
      ["Total", "0.07M credits"],
    ]);
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
  });

  it("expired and stopped ones say so, without a wait time", () => {
    view([planBlock("expired", { waitedMs: 1_800_000 }), spendBlock("cancelled", { waitedMs: 4000 })]);
    expect(screen.getByRole("button", { name: /Expired/ })).toHaveTextContent(/^Expired$/);
    expect(screen.getByRole("button", { name: /Stopped/ })).toHaveTextContent(/^Stopped$/);
  });

  it("the plan tool's own step isn't shown, and doesn't count as a step", () => {
    view([
      { type: "tool_call", toolCallId: "a", toolName: "load_skill", toolInput: { name: "image-generation" }, status: "completed", durationMs: 200 },
      { type: "tool_call", toolCallId: "p", toolName: "propose_plan", toolInput: { title: PLAN.title }, status: "completed" },
      { type: "tool_result", toolCallId: "p", toolName: "propose_plan", result: { status: "approved" }, isError: false },
      planBlock("approved", { waitedMs: 1000 }),
    ]);
    expect(screen.getByText("Completed 1 step")).toBeInTheDocument();
    expect(screen.queryByText("Plan")).not.toBeInTheDocument();
  });

  it("a waitpoint still waiting shows in a saved reply, but not in the one being written (that is the card)", () => {
    const { unmount } = view([planBlock("pending")]);
    expect(screen.getByText("Waiting for approval")).toBeInTheDocument();
    unmount();
    render(<MessageContent blocks={[{ type: "text", content: "Working" }, planBlock("pending")]} chatId="c1" live />);
    expect(screen.queryByText("Waiting for approval")).not.toBeInTheDocument();
  });
});

describe("which waitpoint the run waits on", () => {
  const pending = planBlock("pending");

  it("the one the reply shows waiting", () => {
    expect(waitingOn([pending], null, {})?.id).toBe("wp-1");
  });

  it("none once the reply shows it answered, or this tab closed it", () => {
    expect(waitingOn([planBlock("approved")], null, {})).toBeNull();
    expect(waitingOn([pending], null, { "wp-1": true })).toBeNull();
  });

  it("the server's pending one, before the reply has it (a reload)", () => {
    expect(waitingOn([], { partialBlocks: [], pendingWaitpoint: serverWaitpoint("wp-9") }, {})).toMatchObject({ id: "wp-9", type: "plan", payload: PLAN });
    // unless the reply already shows it closed
    expect(waitingOn([planBlock("approved", { waitpointId: "wp-9" })], { partialBlocks: [], pendingWaitpoint: serverWaitpoint("wp-9") }, {})).toBeNull();
  });

  it("the server closes one it knows about (its saved reply has it) and no longer waits on", () => {
    expect(waitingOn([pending], { partialBlocks: [pending], pendingWaitpoint: null }, {})).toBeNull();
  });

  it("an older server answer, which hasn't seen it yet, doesn't close it", () => {
    expect(waitingOn([pending], { partialBlocks: [], pendingWaitpoint: null }, {})?.id).toBe("wp-1");
  });

  it("the newest of several: a revised plan after changes were asked for", () => {
    expect(waitingOn([planBlock("changes_requested"), planBlock("pending", { waitpointId: "wp-2" })], null, {})?.id).toBe("wp-2");
  });
});

describe("credits in millions", () => {
  it.each([
    [68_700, "0.0687M"],
    [73_700, "0.0737M"],
    [70_000, "0.07M"],
    [5_000, "0.005M"],
    [290_000, "0.29M"],
    [1_500_000, "1.50M"],
    [0, "0M"],
    [10, "<0.0001M"],
  ])("%d → %s", (credits, text) => {
    expect(formatMillions(credits)).toBe(text);
  });
});

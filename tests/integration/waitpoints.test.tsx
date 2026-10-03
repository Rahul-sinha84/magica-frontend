import { screen, waitFor, within } from "@testing-library/react";
import { delay, http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { HomeScreen } from "@/components/chat/HomeScreen";
import { PLAN_PLACEHOLDER } from "@/components/composer/Composer";
import type { AgentStreamChunk, CreditPayload, PlanPayload, Waitpoint } from "@/contracts";
import { RESPOND_UNAVAILABLE } from "@/hooks/useRespondWaitpoint";
import { BACKEND_URL } from "@/lib/config";
import { DRAFTS_KEY, useChatStore } from "@/stores/chatStore";
import { getMockDb } from "../mocks/fixtures";
import { RUN_MS } from "../mocks/handlers";
import { navigation } from "../mocks/navigation";
import { server } from "../mocks/server";
import { realtime } from "../mocks/trigger";
import { stubLayout } from "../utils/layout";
import { renderApp, typeAndSend } from "../utils/render";

vi.mock("@/lib/timing", async (original) => ({
  ...(await original<typeof import("@/lib/timing")>()),
  RUN_POLL_MS: 40,
  LIVE_POLL_MS: 60_000,
}));
stubLayout();
afterEach(() => vi.useRealTimers());

const at = (path: string) => `${BACKEND_URL}${path}`;
const box = () => screen.getByRole("textbox", { name: /Send a message…|Plan mode/ });
const card = (name: "Plan" | "Spend approval" = "Plan") => screen.findByRole("region", { name });
const noCard = (name: "Plan" | "Spend approval" = "Plan") => expect(screen.queryByRole("region", { name })).not.toBeInTheDocument();

const PLAN: PlanPayload = {
  title: "A fox, then a crop",
  overview: "Generate a fox, then crop it to its face.",
  steps: [
    { title: "Generate the fox", description: "GPT Image 2, 1024×1024.", tool: "gpt_image_2", estimatedCredits: 68_700 },
    { title: "Crop to the face", tool: "crop_image", estimatedCredits: 5_000 },
  ],
  notes: "Costs are estimates.",
  totalCredits: 73_700,
};
const SPEND: CreditPayload = {
  calls: [
    { toolCallId: "s3-a", toolName: "gpt_image_2", credits: 70_000 },
    { toolCallId: "s3-b", toolName: "crop_image", credits: 10_000 },
  ],
  totalCredits: 80_000,
};
const EXPIRES = new Date(Date.now() + 30 * 60_000).toISOString();

function running(id = "run-1") {
  getMockDb().runs["chat-greeting"] = { id, chatId: "chat-greeting", triggerRunId: `t-${id}`, status: "RUNNING", startedAt: new Date().toISOString(), completedAt: null };
}

// a waitpoint the mock backend knows (so answering it works), waiting unless said otherwise
function waitpoint(id: string, type: "plan" | "credit" = "plan", overrides: Partial<Waitpoint> = {}): Waitpoint {
  const common = { id, runId: "run-1", status: "pending" as const, feedback: null, expiresAt: EXPIRES, createdAt: new Date().toISOString(), resolvedAt: null };
  const made = (type === "plan" ? { ...common, type, payload: PLAN } : { ...common, type, payload: SPEND }) as Waitpoint;
  return (getMockDb().waitpoints[id] = { ...made, ...overrides } as Waitpoint);
}

const planStart = (id = "wp-1"): AgentStreamChunk => ({ type: "waitpoint-start", waitpointId: id, waitpointType: "plan", payload: PLAN, expiresAt: EXPIRES });
const spendStart = (id = "wp-2"): AgentStreamChunk => ({ type: "waitpoint-start", waitpointId: id, waitpointType: "credit", payload: SPEND, expiresAt: EXPIRES });

// what each answer sent
function answers() {
  const sent: { id: string; body: unknown }[] = [];
  server.use(
    http.post(at("/api/waitpoints/:waitpointId/respond"), async ({ request, params }) => {
      sent.push({ id: params.waitpointId as string, body: await request.clone().json() });
      return undefined;
    }),
  );
  return sent;
}

// what each send carried
function sends() {
  type Body = { content: string; clientMessageId: string; mode?: string };
  const bodies: Body[] = [];
  server.use(
    http.post(at("/api/chats/:chatId/messages"), async ({ request }) => {
      bodies.push((await request.clone().json()) as Body);
      return undefined;
    }),
  );
  return bodies;
}

async function openChat() {
  const view = renderApp(<ChatWindow chatId="chat-greeting" />);
  await screen.findByText("Hi! What can I help you with today?");
  return view;
}

// a run waiting on its plan, from the live stream
async function waitingOnPlan() {
  running();
  waitpoint("wp-1");
  realtime.push(planStart("wp-1"));
  const view = await openChat();
  return { ...view, plan: await card() };
}

describe("plan mode", () => {
  it("⇧+Tab turns it on in the composer, with magica's chip and placeholder, and off again", async () => {
    const { user } = await openChat();
    await user.click(box());
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    const chip = screen.getByRole("button", { name: "Plan" });
    expect(chip).toHaveAttribute("title", expect.stringContaining("Press Shift+Tab to toggle"));
    expect(box()).toHaveAttribute("placeholder", PLAN_PLACEHOLDER);
    expect(box()).toHaveFocus();

    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(screen.queryByRole("button", { name: "Plan" })).not.toBeInTheDocument();
    expect(box()).toHaveAttribute("placeholder", "Send a message…");
  });

  it("the chip turns it off", async () => {
    useChatStore.getState().setPlanMode(true);
    const { user } = await openChat();
    await user.click(screen.getByRole("button", { name: "Plan" }));
    expect(useChatStore.getState().planMode).toBe(false);
    expect(box()).toHaveAttribute("placeholder", "Send a message…");
  });

  it("sends carry mode: plan while it is on, and default otherwise", async () => {
    const bodies = sends();
    const { user } = await openChat();
    await typeAndSend(user, box(), "a fox, please");
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0].mode).toBe("default");
    await user.click(screen.getByRole("button", { name: "Stop response" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Send message" })).toBeInTheDocument());

    await user.click(box());
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    await typeAndSend(user, box(), "make an image of a fox, then crop it");
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1].mode).toBe("plan");
  });

  it("works on the home composer too", async () => {
    const bodies = sends();
    const { user } = renderApp(<HomeScreen />);
    const home = screen.getByPlaceholderText("Assign a task or ask anything…");
    await user.click(home);
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(screen.getByRole("button", { name: "Plan" })).toBeInTheDocument();
    await typeAndSend(user, screen.getByPlaceholderText(PLAN_PLACEHOLDER), "plan a fox");
    await waitFor(() => expect(navigation.push).toHaveBeenCalled());
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0].mode).toBe("plan");
  });

  it("isn't kept across a reload (the draft is)", async () => {
    const { user, unmount } = await openChat();
    await user.type(box(), "unsent");
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(screen.getByRole("button", { name: "Plan" })).toBeInTheDocument();
    unmount();

    // a reload: the store starts afresh and reads back what it kept
    const kept = sessionStorage.getItem(DRAFTS_KEY)!;
    expect(kept).not.toContain("planMode");
    useChatStore.setState(useChatStore.getInitialState(), true);
    sessionStorage.setItem(DRAFTS_KEY, kept);
    await useChatStore.persist.rehydrate();
    await openChat();
    expect(box()).toHaveValue("unsent");
    expect(box()).toHaveAttribute("placeholder", "Send a message…");
    expect(screen.queryByRole("button", { name: "Plan" })).not.toBeInTheDocument();
  });

  it("a resend keeps its id only in the same mode", async () => {
    const ids: string[] = [];
    server.use(
      http.post(at("/api/chats/:chatId/messages"), async ({ request }) => {
        ids.push(((await request.clone().json()) as { clientMessageId: string }).clientMessageId);
        return HttpResponse.json({ error: "x", code: "INTERNAL_ERROR" }, { status: 500 });
      }),
    );
    const { user } = await openChat();
    await typeAndSend(user, box(), "a fox");
    await waitFor(() => expect(box()).toHaveValue("a fox"));
    await user.keyboard("{Enter}");
    await waitFor(() => expect(ids).toHaveLength(2));
    expect(ids[1]).toBe(ids[0]); // same text, same mode: the same message

    await waitFor(() => expect(box()).toHaveValue("a fox"));
    await user.keyboard("{Shift>}{Tab}{/Shift}{Enter}");
    await waitFor(() => expect(ids).toHaveLength(3));
    expect(ids[2]).not.toBe(ids[0]); // the other mode: a different message

    await waitFor(() => expect(box()).toHaveValue("a fox"));
    await user.keyboard("{Enter}");
    await waitFor(() => expect(ids).toHaveLength(4));
    expect(ids[3]).toBe(ids[2]);
  });
});

describe("the plan card", () => {
  it("shows the plan from the stream, above the composer: title, overview, numbered steps with costs, the total and notes", async () => {
    const { plan } = await waitingOnPlan();
    expect(within(plan).getByRole("heading", { name: PLAN.title })).toBeInTheDocument();
    expect(within(plan).getByText(PLAN.overview)).toBeInTheDocument();
    const steps = within(within(plan).getByRole("list", { name: "Steps" })).getAllByRole("listitem");
    expect(steps.map((step) => step.textContent)).toEqual(["1Generate the foxGPT Image 2, 1024×1024.~0.0687M", "2Crop to the face~0.005M"]);
    expect(within(plan).getByText("Estimated total")).toBeInTheDocument();
    expect(within(plan).getByText("~0.0737M credits")).toBeInTheDocument();
    expect(within(plan).getByText("Costs are estimates.")).toBeInTheDocument();
    expect(within(plan).getByText("Enter")).toBeInTheDocument();
    expect(within(plan).getByText("run all")).toBeInTheDocument();
    // it comes before the composer
    expect(plan.compareDocumentPosition(box()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("says the run waits for the user, not that it is thinking or queued, and shows no Plan step", async () => {
    running();
    waitpoint("wp-1");
    realtime.setRun({ status: "WAITING", metadata: { status: "waiting", waitpointId: "wp-1" } });
    realtime.push(
      { type: "tool-start", toolCallId: "s1-a", toolName: "load_skill", toolInput: { name: "image-generation" } },
      { type: "tool-end", toolCallId: "s1-a", status: "completed", durationMs: 200 },
      { type: "tool-start", toolCallId: "s2-p", toolName: "propose_plan", toolInput: { title: PLAN.title } },
      planStart("wp-1"),
    );
    await openChat();
    await card();
    expect(screen.getByText("Waiting for your approval")).toHaveAttribute("role", "status");
    expect(screen.queryByRole("status", { name: "The assistant is thinking" })).not.toBeInTheDocument();
    expect(screen.queryByText(/queued/)).not.toBeInTheDocument();
    expect(screen.queryByText("Plan")).not.toBeInTheDocument();
    expect(screen.getByText("Completed 1 step")).toBeInTheDocument();
  });

  it("comes back after a reload from the server's pending waitpoint", async () => {
    running();
    waitpoint("wp-1");
    realtime.failStream(); // nothing live: only the server's answer
    await openChat();
    expect(within(await card()).getByRole("heading", { name: PLAN.title })).toBeInTheDocument();
    expect(screen.getByText("Waiting for your approval")).toBeInTheDocument();
  });

  it("doesn't come back after a reload when the server has no pending waitpoint", async () => {
    running();
    const run = getMockDb().runs["chat-greeting"];
    server.use(
      http.get(at("/api/chats/:chatId/active-run"), () =>
        HttpResponse.json({
          run,
          realtimeToken: null,
          realtimeTokenExpiresAt: null,
          partialText: "Working on it",
          // the saved reply still shows it waiting: the server's word is that it isn't
          partialBlocks: [
            { type: "text", content: "Working on it" },
            { type: "waitpoint", waitpointId: "wp-1", waitpointType: "plan", payload: PLAN, expiresAt: EXPIRES, status: "pending" },
          ],
          pendingWaitpoint: null,
        }),
      ),
    );
    await openChat();
    await screen.findByText("Working on it");
    noCard();
    expect(screen.queryByText("Waiting for your approval")).not.toBeInTheDocument();
  });

  it("Enter runs all, once", async () => {
    const sent = answers();
    const { user } = await waitingOnPlan();
    await user.keyboard("{Enter}");
    await waitFor(() => noCard());
    expect(sent).toEqual([{ id: "wp-1", body: { action: "approve" } }]);
    expect(getMockDb().waitpoints["wp-1"].status).toBe("approved");
  });

  it("Enter in the empty composer runs all too; with text in it, it doesn't", async () => {
    const sent = answers();
    const { user } = await waitingOnPlan();
    await user.type(box(), "hold on");
    await user.keyboard("{Enter}");
    expect(sent).toEqual([]);
    await user.clear(box());
    await user.keyboard("{Enter}");
    await waitFor(() => expect(sent).toHaveLength(1));
  });

  it("Run All sends one answer, however fast it is clicked, with Enter on top", async () => {
    const sent = answers();
    server.use(http.post(at("/api/waitpoints/:waitpointId/respond"), async () => (await delay(80), undefined)));
    const { user, plan } = await waitingOnPlan();
    const runAll = within(plan).getByRole("button", { name: "Run All" });
    await user.dblClick(runAll);
    await user.keyboard("{Enter}");
    expect(runAll).toBeDisabled();
    expect(within(plan).getByRole("button", { name: "Request Changes" })).toBeDisabled();
    await waitFor(() => noCard());
    expect(sent).toHaveLength(1);
  });

  it("Request Changes: ⌘+Enter sends what was asked for, and nothing is sent without it", async () => {
    const sent = answers();
    const { user, plan } = await waitingOnPlan();
    await user.click(within(plan).getByRole("button", { name: "Request Changes" }));
    const feedback = within(plan).getByRole("textbox", { name: "Requested plan changes" });
    expect(feedback).toHaveFocus();
    expect(feedback).toHaveAttribute("maxlength", "2000");
    expect(within(plan).getByText("to submit changes")).toBeInTheDocument();
    // the buttons give way to the box
    expect(within(plan).queryByRole("button", { name: "Run All" })).not.toBeInTheDocument();

    await user.keyboard("{Meta>}{Enter}{/Meta}");
    await user.type(feedback, "   ");
    await user.keyboard("{Control>}{Enter}{/Control}");
    // plain Enter is a new line here, not Run All
    await user.keyboard("{Enter}");
    expect(sent).toEqual([]);

    await user.clear(feedback);
    await user.type(feedback, "make it a red fox");
    await user.keyboard("{Meta>}{Enter}{/Meta}");
    await waitFor(() => noCard());
    expect(sent).toEqual([{ id: "wp-1", body: { action: "request_changes", feedback: "make it a red fox" } }]);
  });

  it("Ctrl+Enter submits as well", async () => {
    const sent = answers();
    const { user, plan } = await waitingOnPlan();
    await user.click(within(plan).getByRole("button", { name: "Request Changes" }));
    await user.type(within(plan).getByRole("textbox", { name: "Requested plan changes" }), "brighter");
    await user.keyboard("{Control>}{Enter}{/Control}");
    await waitFor(() => expect(sent).toEqual([{ id: "wp-1", body: { action: "request_changes", feedback: "brighter" } }]));
  });

  it("Esc puts the buttons back", async () => {
    const sent = answers();
    const { user, plan } = await waitingOnPlan();
    await user.click(within(plan).getByRole("button", { name: "Request Changes" }));
    await user.keyboard("{Escape}");
    expect(within(plan).queryByRole("textbox", { name: "Requested plan changes" })).not.toBeInTheDocument();
    expect(within(plan).getByRole("button", { name: "Run All" })).toBeInTheDocument();
    expect(sent).toEqual([]);
  });

  it("Step by Step does nothing in this build", async () => {
    const sent = answers();
    const { user, plan } = await waitingOnPlan();
    const step = within(plan).getByRole("button", { name: "Step by Step" });
    expect(step).toHaveAttribute("aria-disabled", "true");
    expect(step).toHaveAttribute("title", "Not available in this build");
    await user.click(step);
    expect(sent).toEqual([]);
    expect(within(plan).queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("a 503 keeps the card and says so; trying again works", async () => {
    let down = true;
    server.use(
      http.post(at("/api/waitpoints/:waitpointId/respond"), () =>
        down ? HttpResponse.json({ error: RESPOND_UNAVAILABLE, code: "SERVICE_UNAVAILABLE" }, { status: 503 }) : undefined,
      ),
    );
    const { user, plan } = await waitingOnPlan();
    await user.click(within(plan).getByRole("button", { name: "Run All" }));
    expect(await within(plan).findByRole("alert")).toHaveTextContent(RESPOND_UNAVAILABLE);
    expect(within(plan).getByRole("button", { name: "Run All" })).toBeEnabled();
    expect(getMockDb().waitpoints["wp-1"].status).toBe("pending");

    down = false;
    await user.click(within(plan).getByRole("button", { name: "Run All" }));
    await waitFor(() => noCard());
    expect(getMockDb().waitpoints["wp-1"].status).toBe("approved");
  });

  it("a refusal (400) shows the server's message on the card", async () => {
    server.use(
      http.post(at("/api/waitpoints/:waitpointId/respond"), () =>
        HttpResponse.json({ error: "feedback: Say what you'd like changed.", code: "VALIDATION_FAILED" }, { status: 400 }),
      ),
    );
    const { user, plan } = await waitingOnPlan();
    await user.click(within(plan).getByRole("button", { name: "Run All" }));
    expect(await within(plan).findByRole("alert")).toHaveTextContent("Say what you'd like changed.");
  });

  it("a 404 (not yours, or gone) takes the card away and says so", async () => {
    running();
    realtime.push(planStart("wp-gone")); // the mock backend doesn't know it
    const { user } = await openChat();
    await user.click(within(await card()).getByRole("button", { name: "Run All" }));
    await waitFor(() => noCard());
    expect(await screen.findByText("Couldn't send your answer")).toBeInTheDocument();
  });

  it("an answer that finds it approved elsewhere clears it", async () => {
    const { user, plan } = await waitingOnPlan();
    Object.assign(getMockDb().waitpoints["wp-1"], { status: "approved", resolvedAt: new Date().toISOString() });
    await user.click(within(plan).getByRole("button", { name: "Request Changes" }));
    await user.type(within(plan).getByRole("textbox", { name: "Requested plan changes" }), "smaller");
    await user.keyboard("{Meta>}{Enter}{/Meta}");
    await waitFor(() => noCard());
  });

  it("clears when the run says it was answered (another tab)", async () => {
    await waitingOnPlan();
    realtime.push({ type: "waitpoint-end", waitpointId: "wp-1", status: "approved", waitedMs: 76_000 });
    await waitFor(() => noCard());
    expect(screen.getByText("Plan approved")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Plan approved/ })).toHaveTextContent("1m 16s");
  });

  it("after an answer, 'Thinking' shows under it until the run's next step arrives", async () => {
    const { user, plan } = await waitingOnPlan();
    await user.click(within(plan).getByRole("button", { name: "Run All" }));
    await waitFor(() => noCard());
    realtime.push({ type: "waitpoint-end", waitpointId: "wp-1", status: "approved", waitedMs: 4000 });
    const approved = await screen.findByText("Plan approved");
    const thinking = screen.getByRole("status", { name: "The assistant is thinking" });
    expect(approved.compareDocumentPosition(thinking) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText("Waiting for your approval")).not.toBeInTheDocument();

    realtime.push({ type: "tool-start", toolCallId: "s3-a", toolName: "gpt_image_2", toolInput: { prompt: "a fox" } });
    await screen.findByText("GPT Image 2");
    expect(screen.queryByRole("status", { name: "The assistant is thinking" })).not.toBeInTheDocument();
  });

  it("clears when it expires", async () => {
    await waitingOnPlan();
    realtime.push({ type: "waitpoint-end", waitpointId: "wp-1", status: "expired", waitedMs: 30 * 60_000 });
    await waitFor(() => noCard());
    expect(screen.getByText("Expired")).toBeInTheDocument();
    expect(screen.queryByText("Waiting for your approval")).not.toBeInTheDocument();
  });

  it("clears when the run is stopped", async () => {
    const { user } = await waitingOnPlan();
    await user.click(screen.getByRole("button", { name: "Stop response" }));
    await waitFor(() => noCard());
    expect(getMockDb().waitpoints["wp-1"].status).toBe("cancelled");
    expect(await screen.findByRole("button", { name: "Send message" })).toBeInTheDocument();
  });

  it("a revised plan is a new card", async () => {
    const { user, plan } = await waitingOnPlan();
    await user.click(within(plan).getByRole("button", { name: "Request Changes" }));
    await user.type(within(plan).getByRole("textbox", { name: "Requested plan changes" }), "a red fox");
    await user.keyboard("{Meta>}{Enter}{/Meta}");
    await waitFor(() => noCard());

    waitpoint("wp-3", "plan", { payload: { ...PLAN, title: "A red fox, then a crop" } });
    realtime.push(
      { type: "waitpoint-end", waitpointId: "wp-1", status: "changes_requested", feedback: "a red fox", waitedMs: 5000 },
      { type: "waitpoint-start", waitpointId: "wp-3", waitpointType: "plan", payload: { ...PLAN, title: "A red fox, then a crop" }, expiresAt: EXPIRES },
    );
    const revised = await card();
    expect(within(revised).getByRole("heading", { name: "A red fox, then a crop" })).toBeInTheDocument();
    // the earlier one is in the reply, with what was asked for
    expect(screen.getByText("Changes requested")).toBeInTheDocument();
    expect(screen.getByText("“a red fox”")).toBeInTheDocument();
  });
});

describe("the spend card", () => {
  async function waitingOnSpend() {
    running();
    waitpoint("wp-2", "credit");
    realtime.push(spendStart("wp-2"));
    const view = await openChat();
    return { ...view, spend: await card("Spend approval") };
  }

  it("lists each call by its tool's name and cost, and the total", async () => {
    const { spend } = await waitingOnSpend();
    const calls = within(within(spend).getByRole("list", { name: "Calls" })).getAllByRole("listitem");
    expect(calls.map((call) => call.textContent)).toEqual(["GPT Image 20.07M", "Crop Image0.01M"]);
    expect(within(spend).getByText("0.08M credits")).toBeInTheDocument();
    expect(within(spend).getByText("approve")).toBeInTheDocument();
    expect(screen.getByText("Waiting for your approval")).toBeInTheDocument();
  });

  it("Approve approves (and so does Enter)", async () => {
    const sent = answers();
    const { user, spend } = await waitingOnSpend();
    await user.click(within(spend).getByRole("button", { name: "Approve" }));
    await waitFor(() => noCard("Spend approval"));
    expect(sent).toEqual([{ id: "wp-2", body: { action: "approve" } }]);
  });

  it("Enter approves", async () => {
    const sent = answers();
    const { user } = await waitingOnSpend();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(sent).toEqual([{ id: "wp-2", body: { action: "approve" } }]));
  });

  it("Reject rejects, and the declined steps say so", async () => {
    const sent = answers();
    const { user, spend } = await waitingOnSpend();
    await user.click(within(spend).getByRole("button", { name: "Reject" }));
    await waitFor(() => noCard("Spend approval"));
    expect(sent).toEqual([{ id: "wp-2", body: { action: "reject" } }]);

    // the run carries on: the calls fail, charging nothing
    realtime.push(
      { type: "waitpoint-end", waitpointId: "wp-2", status: "rejected", waitedMs: 3000 },
      { type: "tool-start", toolCallId: "s3-a", toolName: "gpt_image_2", toolInput: { prompt: "a fox" } },
      { type: "tool-end", toolCallId: "s3-a", status: "failed", errorMessage: "You declined this spend." },
    );
    expect(await screen.findByText("You declined this spend.")).toBeInTheDocument();
    expect(screen.getByText("Spend declined")).toBeInTheDocument();
  });
});

describe("a plan-mode run against the mock backend", () => {
  it("proposes, takes a change, then runs all and lands with both answers in the reply", async () => {
    const { user } = await openChat();
    await user.click(box());
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    await typeAndSend(user, box(), "make an image of a fox, then crop it");
    await screen.findByRole("button", { name: "Stop response" });

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + RUN_MS * 0.3 + 100);
    const first = await card();
    expect(within(first).getByRole("heading", { name: "Plan for your request" })).toBeInTheDocument();

    await user.click(within(first).getByRole("button", { name: "Request Changes" }));
    await user.type(within(first).getByRole("textbox", { name: "Requested plan changes" }), "make it a red fox");
    await user.keyboard("{Meta>}{Enter}{/Meta}");
    const revised = await screen.findByRole("heading", { name: "Revised plan" });
    expect(within(revised.closest("section")!).getByText("Updated to: make it a red fox")).toBeInTheDocument();

    await user.click(within(revised.closest("section")!).getByRole("button", { name: "Run All" }));
    await waitFor(() => noCard());
    vi.setSystemTime(Date.now() + RUN_MS);
    expect(await screen.findByText(/This answer comes from the mock backend/)).toBeInTheDocument();
    await waitFor(() => expect(useChatStore.getState().runs["chat-greeting"]).toBeUndefined());
    expect(screen.getByText("Changes requested")).toBeInTheDocument();
    expect(screen.getByText("Plan approved")).toBeInTheDocument();
  });
});

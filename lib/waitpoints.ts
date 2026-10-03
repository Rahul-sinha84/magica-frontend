import type { ActiveRunResponse, CreditPayload, PlanPayload, Waitpoint, WaitpointBlock } from "@/contracts";
import type { ContentBlock } from "@/types";

// What a run is waiting on the user for, as the card above the composer shows it.
export type PendingWaitpoint =
  | { id: string; type: "plan"; payload: PlanPayload; expiresAt: string }
  | { id: string; type: "credit"; payload: CreditPayload; expiresAt: string };

const fromBlock = (block: WaitpointBlock): PendingWaitpoint =>
  block.waitpointType === "plan"
    ? { id: block.waitpointId, type: "plan", payload: block.payload, expiresAt: block.expiresAt }
    : { id: block.waitpointId, type: "credit", payload: block.payload, expiresAt: block.expiresAt };

const fromWaitpoint = (waitpoint: Waitpoint): PendingWaitpoint =>
  waitpoint.type === "plan"
    ? { id: waitpoint.id, type: "plan", payload: waitpoint.payload, expiresAt: waitpoint.expiresAt }
    : { id: waitpoint.id, type: "credit", payload: waitpoint.payload, expiresAt: waitpoint.expiresAt };

const isWaitpoint = (block: ContentBlock): block is WaitpointBlock => block.type === "waitpoint";

/**
 * The waitpoint the run is waiting on, if any, from what the reply shows (the live stream, or the server's saved
 * progress), the server's last answer, and what this tab already knows is closed.
 *
 * The server reads the saved reply before the pending waitpoint, so an answer whose saved reply has a waitpoint
 * speaks for it: if that answer's pendingWaitpoint isn't the same one, it is closed (answered elsewhere, say). An
 * answer whose saved reply doesn't have it yet predates it, and says nothing about it.
 */
export function waitingOn(
  blocks: readonly ContentBlock[],
  server: Pick<ActiveRunResponse, "partialBlocks" | "pendingWaitpoint"> | null,
  closed: Readonly<Record<string, true>>,
): PendingWaitpoint | null {
  const shown = blocks.filter(isWaitpoint);
  const serverClosed = (id: string) => !!server?.partialBlocks.some((block) => isWaitpoint(block) && block.waitpointId === id) && server.pendingWaitpoint?.id !== id;

  // one waitpoint at a time: the newest the reply shows waiting
  let latest: WaitpointBlock | undefined;
  for (const block of shown) if (block.status === "pending") latest = block;
  if (latest && !closed[latest.waitpointId] && !serverClosed(latest.waitpointId)) return fromBlock(latest);

  // the server's word, when the reply hasn't caught up (a reload, before the stream replays)
  const pending = server?.pendingWaitpoint;
  const shownClosed = (id: string) => shown.some((block) => block.waitpointId === id && block.status !== "pending");
  if (pending && pending.status === "pending" && !closed[pending.id] && !shownClosed(pending.id)) return fromWaitpoint(pending);
  return null;
}

// Credits in millions, as magica's plan card writes them: "0.0687M", "0.29M", "1.50M".
export function formatMillions(credits: number) {
  if (!Number.isFinite(credits) || credits <= 0) return "0M";
  const millions = credits / 1_000_000;
  if (millions < 0.0001) return "<0.0001M";
  // four places, trimmed back to two where the rest are zeros
  return `${millions.toFixed(4).replace(/0{1,2}$/, "")}M`;
}

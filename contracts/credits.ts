// Generated from magica-backend/src/contracts by `pnpm contracts:sync` (run in the backend repo). Do not edit by hand.
import { z } from "zod";

// `balance` is the total; what can still be spent is `balance - held` (credits reserved by runs in flight).
export const CreditsResponseSchema = z.object({
  balance: z.number(),
  held: z.number(),
});

export type Credits = z.infer<typeof CreditsResponseSchema>;

// Source of truth: magica-backend. Re-sync with `pnpm contracts:sync`, never edit by hand.
import { z } from "zod";

export const CreditsResponseSchema = z.object({
  balance: z.number(),
  held: z.number(),
});

export type Credits = z.infer<typeof CreditsResponseSchema>;

// Source of truth: magica-backend. Re-sync with `pnpm contracts:sync`, never edit by hand.
import { z } from "zod";

// Accepts both "…Z" and "…+05:30", so a change in the backend's date serialiser can't break every screen.
export const IsoDateTimeSchema = z.iso.datetime({ offset: true });

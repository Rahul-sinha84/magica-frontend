import { fail, SYNC_HINT } from "./lib/contracts.mjs";

// The backend owns the contracts and pushes them into this repo. Copying them from here would
// skip the steps the push does (extensionless imports, the generated header, the lock file),
// so this command only explains where to run the sync.
fail(`Contracts are pushed from the backend, not pulled here.\n${SYNC_HINT}`);

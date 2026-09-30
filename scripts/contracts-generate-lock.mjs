import { writeLock } from "./lib/contracts.mjs";

const lock = writeLock();
console.log(`contracts.lock.json written for ${Object.keys(lock).length} files`);

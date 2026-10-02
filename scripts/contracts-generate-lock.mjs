// Written by the backend's contracts sync, in this exact format. Never run it by hand: a lock made
// here would approve whatever is in contracts/, including a bad copy.
import { writeLock } from "./lib/contracts.mjs";

const lock = writeLock();
console.log(`contracts.lock.json written for ${Object.keys(lock).length} files`);

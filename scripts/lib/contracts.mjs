import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const CONTRACTS_DIR = "contracts";
export const LOCK_FILE = "contracts.lock.json";

// Contracts are pushed here by the backend; nothing in this repo creates or edits them.
export const SYNC_HINT =
  "Run `pnpm contracts:sync` in ../magica-backend (set FRONTEND_REPO_PATH if this repo is not next to it), then `pnpm contracts:check` here.";

export function fail(message) {
  console.error(message);
  process.exit(1);
}

export function contractFiles(dir) {
  return readdirSync(dir).filter((file) => file.endsWith(".ts")).sort();
}

// Line endings are normalised so a Windows checkout doesn't look like drift.
export function hashContracts(dir = CONTRACTS_DIR) {
  if (!existsSync(dir)) fail(`The ${dir}/ folder is missing. ${SYNC_HINT}`);
  return Object.fromEntries(
    contractFiles(dir).map((file) => {
      const text = readFileSync(join(dir, file), "utf8").replace(/\r\n/g, "\n");
      return [file, createHash("sha256").update(text).digest("hex")];
    }),
  );
}

export function writeLock() {
  const lock = hashContracts();
  writeFileSync(LOCK_FILE, JSON.stringify(lock, null, 2) + "\n");
  return lock;
}

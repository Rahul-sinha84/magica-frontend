import { copyFileSync, existsSync, mkdirSync, realpathSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { CONTRACTS_DIR, contractFiles, fail, writeLock } from "./lib/contracts.mjs";

const source = resolve(process.env.CONTRACTS_SOURCE ?? "../magica-backend/contracts");

if (!existsSync(source)) {
  fail(`Contracts source not found: ${source}\nSet CONTRACTS_SOURCE to the backend's contracts folder.`);
}
if (existsSync(CONTRACTS_DIR) && realpathSync(source) === realpathSync(CONTRACTS_DIR)) fail("The contracts source is this project's own contracts folder.");

const files = contractFiles(source);
if (files.length === 0) fail(`No .ts contract files in ${source}`);

mkdirSync(CONTRACTS_DIR, { recursive: true });
for (const file of files) copyFileSync(join(source, file), join(CONTRACTS_DIR, file));

// mirror the backend: a contract it deleted must not linger here
for (const file of contractFiles(CONTRACTS_DIR)) {
  if (!files.includes(file)) {
    unlinkSync(join(CONTRACTS_DIR, file));
    console.log(`Removed ${file} (no longer in the backend)`);
  }
}

writeLock();
console.log(`Synced ${files.length} contract files from ${source}`);

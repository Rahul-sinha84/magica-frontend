import { existsSync, readFileSync } from "node:fs";
import { fail, hashContracts, LOCK_FILE } from "./lib/contracts.mjs";

if (!existsSync(LOCK_FILE)) {
  fail(`${LOCK_FILE} is missing. Run \`pnpm contracts:sync\` (or contracts:generate-lock).`);
}

let expected;
try {
  expected = JSON.parse(readFileSync(LOCK_FILE, "utf8"));
} catch {
  fail(`${LOCK_FILE} is not valid JSON (a merge conflict?). Regenerate it with \`pnpm contracts:sync\`.`);
}
if (typeof expected !== "object" || expected === null || Array.isArray(expected)) {
  fail(`${LOCK_FILE} has the wrong shape. Regenerate it with \`pnpm contracts:sync\`.`);
}

const actual = hashContracts();
const problems = [];

for (const file of Object.keys(expected)) {
  if (!(file in actual)) problems.push(`missing contract file: ${file}`);
  else if (actual[file] !== expected[file]) problems.push(`drift: ${file} was edited by hand`);
}
for (const file of Object.keys(actual)) {
  if (!(file in expected)) problems.push(`not in the lock file: ${file}`);
}

if (problems.length > 0) {
  fail(`${problems.map((problem) => `  ${problem}`).join("\n")}\n\nContracts check failed. Re-sync from the backend with \`pnpm contracts:sync\`.`);
}

console.log("All contracts verified");

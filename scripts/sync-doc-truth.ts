#!/usr/bin/env bun

import { runSyncDocTruth } from "./sync-doc-truth/sync";

const mode = process.argv.includes("--write") ? "write" : "check";
const failures = runSyncDocTruth({ mode });

if (failures.length > 0) {
  console.error(
    mode === "write"
      ? "Doc truth sync wrote files but some targets are still unresolved."
      : "Doc truth check failed. Run `bun run scripts/sync-doc-truth.ts --write`.",
  );
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  mode === "write" ? "Doc truth files updated." : "Doc truth check passed.",
);

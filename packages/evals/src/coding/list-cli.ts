#!/usr/bin/env nub

import { CODING_EVAL_CASES, CODING_EVAL_SUITES } from "./cases";

console.log("Coding acceptance cases:");
for (const evalCase of Object.values(CODING_EVAL_CASES)) {
  console.log(`  ${evalCase.id} — ${evalCase.title}`);
}

console.log("\nVersioned task suites:");
for (const [suiteKey, suite] of Object.entries(CODING_EVAL_SUITES)) {
  console.log(`  ${suiteKey} — ${suite.title}`);
  for (const task of suite.tasks) {
    console.log(`    ${task.id} — ${task.title} (${task.caseId})`);
  }
}

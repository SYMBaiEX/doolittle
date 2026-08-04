#!/usr/bin/env nub

import { spawnSync } from "node:child_process";

const FORBIDDEN_TRACKED_PATTERNS: Array<{
  pattern: RegExp;
  reason: string;
}> = [
  {
    pattern: /^\.doolittle\//u,
    reason: "runtime state should not be tracked",
  },
  {
    pattern: /^fake-home\//u,
    reason: "repo-root auth fixtures should not be tracked",
  },
  {
    pattern: /(^|\/)node_modules\//u,
    reason: "nested dependency trees should not be tracked",
  },
  {
    pattern: /(^|\/)dist\//u,
    reason: "generated build artifacts should not be tracked",
  },
  {
    pattern: /\.tsbuildinfo$/u,
    reason: "TypeScript build metadata should not be tracked",
  },
  {
    pattern: /(^|\/)coverage\//u,
    reason: "coverage output should not be tracked",
  },
];

const RETIRED_MIGRATION_ARTIFACTS = new Set([
  "packages/agent/src/cli/jobs/render.ts",
  "packages/agent/src/gateway/read/index.ts",
  "packages/agent/src/gateway/state/index.ts",
  "packages/agent/src/runtime/chat-turn/provider/settings.ts",
  "packages/agent/src/runtime/native/account-auth/claude-code/constants.ts",
  "packages/agent/src/runtime/native/account-auth/claude-code/status.test.ts",
  "packages/agent/src/runtime/native/account-auth/claude-code/status.ts",
  "packages/agent/src/services/assembly/index.ts",
  "packages/agent/src/services/delegation/service-types.ts",
  "packages/agent/src/services/skill-synthesis/index.ts",
  "packages/agent/src/services/skills-hub/index.ts",
  "packages/agent/src/services/terminal/execution/subprocess/streaming.ts",
  "packages/agent/src/services/tools/index.ts",
  "packages/agent/src/services/user-profile/index.ts",
  "packages/agent/src/services/web/index.ts",
  "packages/contracts/src/browser.ts",
  "packages/contracts/src/plugin-catalog.ts",
  "packages/contracts/src/records.ts",
  "packages/contracts/src/storage.ts",
  "scripts/bootstrap/wizard-screen/index.ts",
]);

function gitLsFiles(): string[] {
  const result = spawnSync("git", ["ls-files"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(`git ls-files failed.\n${detail}`.trim());
  }

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function main(): void {
  const trackedFiles = gitLsFiles();
  const failures = trackedFiles.flatMap((path) =>
    FORBIDDEN_TRACKED_PATTERNS.filter(({ pattern }) => pattern.test(path)).map(
      ({ reason }) => `${path} (${reason})`,
    ),
  );
  for (const path of trackedFiles) {
    if (RETIRED_MIGRATION_ARTIFACTS.has(path)) {
      failures.push(`${path} (retired post-migration compatibility artifact)`);
    }
  }

  if (failures.length > 0) {
    console.error("Tracked artifact hygiene check failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("Repo hygiene check passed.");
}

main();

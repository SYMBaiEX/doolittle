#!/usr/bin/env nub

import { listGitTrackedFiles } from "./git-tracked-files";

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
  {
    pattern: /^apps\/desktop\/(?:build|release)\//u,
    reason: "desktop packaging output should not be tracked",
  },
];

const RETIRED_MIGRATION_ARTIFACTS = new Set([
  "agent-chat-turn-tscheck.json",
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

function main(): void {
  const trackedFiles = listGitTrackedFiles();
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

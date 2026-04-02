#!/usr/bin/env bun

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

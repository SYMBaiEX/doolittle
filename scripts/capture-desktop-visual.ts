#!/usr/bin/env nub

import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

export function visualSweepCandidates(
  platform: NodeJS.Platform,
  root = repoRoot,
): string[] {
  if (platform === "darwin") {
    return [
      "/Applications/Doolittle.app/Contents/MacOS/Doolittle",
      join(
        root,
        "apps/desktop/release/mac-arm64/Doolittle.app/Contents/MacOS/Doolittle",
      ),
    ];
  }
  if (platform === "win32") {
    return [join(root, "apps/desktop/release/win-unpacked/Doolittle.exe")];
  }
  return [join(root, "apps/desktop/release/linux-unpacked/Doolittle")];
}

export function selectVisualSweepExecutable(
  candidates: readonly string[],
  isExecutable = (path: string) => existsSync(path) && statSync(path).isFile(),
): string | null {
  return candidates.find((candidate) => isExecutable(candidate)) ?? null;
}

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : undefined;
}

export function main(): void {
  const requestedExecutable =
    argumentValue("--executable") ?? process.env.DOOLITTLE_DESKTOP_EXECUTABLE;
  const executable = requestedExecutable
    ? resolve(requestedExecutable)
    : selectVisualSweepExecutable(visualSweepCandidates(process.platform));
  if (!executable) {
    throw new Error(
      "No packaged Doolittle executable was found. Install/package the app or pass --executable <path>.",
    );
  }

  const output = resolve(
    argumentValue("--output") ??
      process.env.DOOLITTLE_SWEEP_SCREENSHOTS_DIR ??
      join(repoRoot, "var/playwright/route-screenshots"),
  );
  const profile =
    argumentValue("--profile") ?? process.env.DOOLITTLE_DESKTOP_PROFILE_DIR;
  const nubx = resolve(repoRoot, "node_modules/.bin/nubx");
  const result = spawnSync(
    nubx,
    [
      "playwright",
      "test",
      "--config",
      "playwright.packaged.config.ts",
      "e2e/desktop-profile-sweep.pw.ts",
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        DOOLITTLE_DESKTOP_EXECUTABLE: executable,
        DOOLITTLE_SWEEP_SCREENSHOTS_DIR: output,
        ...(profile ? { DOOLITTLE_DESKTOP_PROFILE_DIR: resolve(profile) } : {}),
      },
      stdio: "inherit",
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `Desktop visual sweep failed with exit code ${result.status ?? "unknown"}.`,
    );
  }
  console.log(`Visual evidence written to ${output}`);
}

if (import.meta.main) main();

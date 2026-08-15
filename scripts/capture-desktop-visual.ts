#!/usr/bin/env nub

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  realpathSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

export function visualSweepCandidates(
  platform: NodeJS.Platform,
  root = repoRoot,
): string[] {
  if (platform === "darwin") {
    return [
      join(
        root,
        "apps/desktop/release/mac-arm64/Doolittle.app/Contents/MacOS/Doolittle",
      ),
      "/Applications/Doolittle.app/Contents/MacOS/Doolittle",
    ];
  }
  if (platform === "win32") {
    return [join(root, "apps/desktop/release/win-unpacked/Doolittle.exe")];
  }
  return [join(root, "apps/desktop/release/linux-unpacked/Doolittle")];
}

export function assertVisualSweepProvenance({
  executableSha256,
  releaseRevision,
  repositoryExecutableSha256,
  sourceRevision,
  worktreeClean,
}: {
  executableSha256: string;
  releaseRevision: string;
  repositoryExecutableSha256: string;
  sourceRevision: string;
  worktreeClean: boolean;
}): void {
  if (!worktreeClean) {
    throw new Error(
      "Desktop visual evidence requires a clean worktree so screenshots map to one source revision.",
    );
  }
  if (!sourceRevision || releaseRevision !== sourceRevision) {
    throw new Error(
      `Packaged desktop revision ${releaseRevision || "unknown"} does not match HEAD ${sourceRevision || "unknown"}. Rebuild the desktop release first.`,
    );
  }
  if (!executableSha256 || executableSha256 !== repositoryExecutableSha256) {
    throw new Error(
      "Selected desktop executable does not match the repository package. Pass the current repository executable or reinstall the exact package.",
    );
  }
}

export function selectVisualSweepExecutable(
  candidates: readonly string[],
  isExecutable = (path: string) => existsSync(path) && statSync(path).isFile(),
): string | null {
  return candidates.find((candidate) => isExecutable(candidate)) ?? null;
}

export function legacyVisualEvidencePaths(
  output: string,
  priorManifest: string | undefined,
): string[] {
  const routeNames = new Set<string>();
  if (priorManifest) {
    try {
      const parsed = JSON.parse(priorManifest) as {
        routes?: Array<{ route?: unknown }>;
      };
      for (const entry of parsed.routes ?? []) {
        if (
          typeof entry.route === "string" &&
          /^[a-zA-Z0-9_-]+$/u.test(entry.route)
        ) {
          routeNames.add(entry.route);
        }
      }
    } catch {
      // The sweep replaces malformed manifests; cleanup stays bounded.
    }
  }

  return [
    "contact-desktop.png",
    "contact-narrow.png",
    ...Array.from(routeNames, (route) => `${route}.png`),
  ].map((name) => join(output, name));
}

function cleanLegacyVisualEvidence(output: string): void {
  const manifestPath = join(output, "visual-manifest.json");
  const priorManifest = existsSync(manifestPath)
    ? readFileSync(manifestPath, "utf8")
    : undefined;
  for (const path of legacyVisualEvidencePaths(output, priorManifest)) {
    if (existsSync(path) && statSync(path).isFile()) unlinkSync(path);
  }
}

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : undefined;
}

function gitOutput(args: string[]): string {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed while preparing visual evidence.`,
    );
  }
  return result.stdout.trim();
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function releaseRevision(): string {
  const manifestPath = join(
    repoRoot,
    "apps/desktop/release/release-manifest.json",
  );
  if (!existsSync(manifestPath)) {
    throw new Error(
      "Desktop release manifest is missing. Run `nub run desktop:package:all` first.",
    );
  }
  const parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    commit?: unknown;
  };
  return typeof parsed.commit === "string" ? parsed.commit.trim() : "";
}

export function main(): void {
  const candidates = visualSweepCandidates(process.platform);
  const requestedExecutable =
    argumentValue("--executable") ?? process.env.DOOLITTLE_DESKTOP_EXECUTABLE;
  const executable = requestedExecutable
    ? resolve(requestedExecutable)
    : selectVisualSweepExecutable(candidates);
  if (!executable) {
    throw new Error(
      "No packaged Doolittle executable was found. Install/package the app or pass --executable <path>.",
    );
  }
  const repositoryExecutable = candidates[0];
  if (!repositoryExecutable || !existsSync(repositoryExecutable)) {
    throw new Error(
      "The repository desktop package is missing. Run `nub run desktop:package:all` first.",
    );
  }
  const sourceRevision = gitOutput(["rev-parse", "HEAD"]);
  const selectedExecutable = realpathSync(executable);
  const repositoryExecutableSha256 = sha256File(
    realpathSync(repositoryExecutable),
  );
  const executableSha256 = sha256File(selectedExecutable);
  assertVisualSweepProvenance({
    executableSha256,
    releaseRevision: releaseRevision(),
    repositoryExecutableSha256,
    sourceRevision,
    worktreeClean: gitOutput(["status", "--porcelain"]).length === 0,
  });

  const output = resolve(
    argumentValue("--output") ??
      process.env.DOOLITTLE_SWEEP_SCREENSHOTS_DIR ??
      join(repoRoot, "var/playwright/route-screenshots"),
  );
  cleanLegacyVisualEvidence(output);
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
        DOOLITTLE_DESKTOP_EXECUTABLE: selectedExecutable,
        DOOLITTLE_SWEEP_EXECUTABLE_PATH: selectedExecutable,
        DOOLITTLE_SWEEP_EXECUTABLE_SHA256: executableSha256,
        DOOLITTLE_SWEEP_SOURCE_REVISION: sourceRevision,
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

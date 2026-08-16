#!/usr/bin/env nub

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

export function packagedTestCandidates(
  platform: NodeJS.Platform,
  root = repoRoot,
  arch = process.arch,
): string[] {
  if (platform === "darwin") {
    return [
      join(
        root,
        `apps/desktop/release/mac-${arch}/Doolittle.app/Contents/MacOS/Doolittle`,
      ),
      join(
        root,
        "apps/desktop/release/mac/Doolittle.app/Contents/MacOS/Doolittle",
      ),
    ];
  }
  if (platform === "win32") {
    return [
      join(root, "apps/desktop/release/win-x64-unpacked/Doolittle.exe"),
      join(root, "apps/desktop/release/win-unpacked/Doolittle.exe"),
    ];
  }
  return [
    join(root, "apps/desktop/release/linux-x64-unpacked/Doolittle"),
    join(root, "apps/desktop/release/linux-unpacked/Doolittle"),
  ];
}

export function resolvePackagedTestExecutable({
  candidates,
  requestedExecutable,
  isExecutable = (path: string) => existsSync(path) && statSync(path).isFile(),
}: {
  candidates: readonly string[];
  requestedExecutable?: string;
  isExecutable?: (path: string) => boolean;
}): string {
  if (requestedExecutable) {
    const requested = resolve(requestedExecutable);
    if (!isExecutable(requested)) {
      throw new Error(
        `DOOLITTLE_DESKTOP_EXECUTABLE does not identify a packaged executable: ${requested}`,
      );
    }
    return requested;
  }

  const selected = candidates.find(isExecutable);
  if (!selected) {
    throw new Error(
      "No packaged Doolittle executable was found. Run `nub run desktop:package:dir` for this host, `nub run desktop:package:all` for the release matrix, or set DOOLITTLE_DESKTOP_EXECUTABLE.",
    );
  }
  return selected;
}

export function packagedAppAsarPath(executable: string): string {
  return executable.includes(".app/")
    ? resolve(dirname(executable), "../Resources/app.asar")
    : resolve(dirname(executable), "resources/app.asar");
}

export function assertRepositoryPackageProvenance({
  sourceRevision,
  worktreeClean,
  manifestRevision,
  appAsarPath,
  manifestAppAsarPath,
  appAsarSha256,
  manifestAppAsarSha256,
}: {
  sourceRevision: string;
  worktreeClean: boolean;
  manifestRevision: string;
  appAsarPath: string;
  manifestAppAsarPath: string;
  appAsarSha256: string;
  manifestAppAsarSha256: string;
}): void {
  if (!worktreeClean) {
    throw new Error(
      "The worktree is dirty. Commit the verified source before testing an automatic repository package.",
    );
  }
  if (!sourceRevision || manifestRevision !== sourceRevision) {
    throw new Error(
      "The repository package was not built from the current HEAD. Rebuild it before running packaged tests.",
    );
  }
  if (
    manifestAppAsarPath !== appAsarPath ||
    manifestAppAsarSha256 !== appAsarSha256
  ) {
    throw new Error(
      "The repository package does not match its release manifest. Rebuild it before running packaged tests.",
    );
  }
}

function gitOutput(args: string[]): string {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0)
    throw new Error("Unable to inspect repository state.");
  return result.stdout.trim();
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function verifyAutomaticRepositoryPackage(executable: string): void {
  const releaseRoot = join(repoRoot, "apps/desktop/release");
  const manifestPaths = [
    join(releaseRoot, "release-manifest.json"),
    join(releaseRoot, "unpacked-manifest.json"),
  ].filter(existsSync);
  if (manifestPaths.length === 0) {
    throw new Error(
      "The desktop package manifest is missing. Run `nub run desktop:package:dir` before automatic packaged tests, or pass an explicit DOOLITTLE_DESKTOP_EXECUTABLE.",
    );
  }
  const appAsar = realpathSync(packagedAppAsarPath(executable));
  const appAsarRelativePath = relative(releaseRoot, appAsar);
  const sourceRevision = gitOutput(["rev-parse", "HEAD"]);
  const appAsarSha256 = sha256File(appAsar);
  const manifests = manifestPaths.map(
    (manifestPath) =>
      JSON.parse(readFileSync(manifestPath, "utf8")) as {
        commit?: unknown;
        appAsarPath?: unknown;
        sha256?: unknown;
        unpackedPackages?: Array<{
          appAsarPath?: unknown;
          sha256?: unknown;
        }>;
      },
  );
  const matching = manifests
    .flatMap((manifest) => {
      const records = manifest.unpackedPackages ?? [manifest];
      return records.map((record) => ({ manifest, record }));
    })
    .find(
      ({ manifest, record }) =>
        manifest.commit === sourceRevision &&
        record.appAsarPath === appAsarRelativePath &&
        record.sha256 === appAsarSha256,
    );
  const manifest = matching?.manifest;
  const packageRecord = matching?.record;
  assertRepositoryPackageProvenance({
    sourceRevision,
    worktreeClean: gitOutput(["status", "--porcelain"]).length === 0,
    manifestRevision:
      typeof manifest?.commit === "string" ? manifest.commit.trim() : "",
    appAsarPath: appAsarRelativePath,
    manifestAppAsarPath:
      typeof packageRecord?.appAsarPath === "string"
        ? packageRecord.appAsarPath
        : "",
    appAsarSha256,
    manifestAppAsarSha256:
      typeof packageRecord?.sha256 === "string" ? packageRecord.sha256 : "",
  });
}

export function main(): void {
  const requestedExecutable = process.env.DOOLITTLE_DESKTOP_EXECUTABLE;
  const executable = realpathSync(
    resolvePackagedTestExecutable({
      candidates: packagedTestCandidates(process.platform, repoRoot),
      requestedExecutable,
    }),
  );
  if (!requestedExecutable) verifyAutomaticRepositoryPackage(executable);
  console.log(`Packaged desktop executable: ${executable}`);
  const nubx = resolve(repoRoot, "node_modules/.bin/nubx");
  const result = spawnSync(
    nubx,
    [
      "playwright",
      "test",
      "--config",
      "playwright.packaged.config.ts",
      ...process.argv
        .slice(2)
        .filter((arg, index) => index > 0 || arg !== "--"),
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        DOOLITTLE_DESKTOP_EXECUTABLE: executable,
      },
      stdio: "inherit",
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `Packaged desktop tests failed with exit code ${result.status ?? "unknown"}.`,
    );
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(
      `Packaged desktop tests: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}

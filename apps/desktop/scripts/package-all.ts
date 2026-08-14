import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const releaseRoot = resolve(desktopRoot, "release");

type DesktopManifest = { version: string };

export type ReleaseTarget = {
  id: "mac" | "win" | "linux";
  builderArgs: string[];
  artifacts: string[];
  appAsarCandidates: string[];
  cleanupPaths: string[];
};

export function releaseTargets(
  version: string,
  hostArch: string,
): ReleaseTarget[] {
  return [
    {
      id: "mac",
      builderArgs: ["--mac", "dmg", "zip", `--${hostArch}`],
      artifacts: [
        `Doolittle-${version}-mac-${hostArch}.dmg`,
        `Doolittle-${version}-mac-${hostArch}.zip`,
      ],
      appAsarCandidates: [
        `mac-${hostArch}/Doolittle.app/Contents/Resources/app.asar`,
        "mac/Doolittle.app/Contents/Resources/app.asar",
      ],
      cleanupPaths: [`mac-${hostArch}`, "mac"],
    },
    {
      id: "win",
      builderArgs: ["--win", "nsis", "--x64"],
      artifacts: [`Doolittle-${version}-win-x64.exe`],
      appAsarCandidates: [
        "win-x64-unpacked/resources/app.asar",
        "win-unpacked/resources/app.asar",
      ],
      cleanupPaths: ["win-x64-unpacked", "win-unpacked"],
    },
    {
      id: "linux",
      builderArgs: ["--linux", "AppImage", "deb", `--${hostArch}`],
      artifacts: [
        `Doolittle-${version}-linux-${hostArch}.AppImage`,
        `Doolittle-${version}-linux-${hostArch}.deb`,
      ],
      appAsarCandidates: [
        `linux-${hostArch}-unpacked/resources/app.asar`,
        "linux-unpacked/resources/app.asar",
      ],
      cleanupPaths: [`linux-${hostArch}-unpacked`, "linux-unpacked"],
    },
  ];
}

export function resolveSingleExistingPath(
  root: string,
  candidates: string[],
): string {
  const existing = candidates
    .map((candidate) => resolve(root, candidate))
    .filter(existsSync);
  if (existing.length !== 1) {
    throw new Error(
      `Expected exactly one packaged path from ${candidates.join(", ")}; found ${existing.length}.`,
    );
  }
  return existing[0];
}

function run(command: string, args: string[], cwd = repoRoot): void {
  console.log(`\n> ${[command, ...args].join(" ")}`);
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env },
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}.`,
    );
  }
}

function requireAllBuildHost(): void {
  if (process.platform !== "darwin") {
    throw new Error(
      "Building macOS, Windows, and Linux together requires a macOS host. Use the platform-specific package commands or release workflows elsewhere.",
    );
  }
  const wine = spawnSync("wine", ["--version"], { stdio: "ignore" });
  if (wine.status !== 0) {
    throw new Error(
      "Windows cross-packaging requires Wine. Install Wine, then rerun `nub run desktop:package:all`.",
    );
  }
}

function cleanTarget(target: ReleaseTarget): void {
  for (const path of [
    ...target.cleanupPaths,
    ...target.artifacts,
    ...target.artifacts.map((artifact) => `${artifact}.blockmap`),
  ]) {
    rmSync(resolve(releaseRoot, path), { force: true, recursive: true });
  }
}

function requireArtifact(path: string): void {
  if (
    !existsSync(path) ||
    !statSync(path).isFile() ||
    statSync(path).size === 0
  ) {
    throw new Error(`Expected release artifact is missing or empty: ${path}`);
  }
}

async function sha256(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function main(): Promise<void> {
  requireAllBuildHost();
  const manifest = JSON.parse(
    readFileSync(resolve(desktopRoot, "package.json"), "utf8"),
  ) as DesktopManifest;
  const targets = releaseTargets(manifest.version, process.arch);
  const nub = resolve(repoRoot, "node_modules", ".bin", "nub");
  const nubx = resolve(repoRoot, "node_modules", ".bin", "nubx");

  for (const target of targets) cleanTarget(target);
  rmSync(resolve(releaseRoot, "release-manifest.json"), { force: true });

  run(nub, ["run", "build"], desktopRoot);
  run(nub, ["run", "runtime:prepare"], desktopRoot);

  const releaseArtifacts: Array<{
    target: ReleaseTarget["id"];
    path: string;
    bytes: number;
    sha256: string;
  }> = [];
  for (const target of targets) {
    run(
      nubx,
      ["electron-builder", ...target.builderArgs, "--publish", "never"],
      desktopRoot,
    );
    const appAsarPath = resolveSingleExistingPath(
      releaseRoot,
      target.appAsarCandidates,
    );
    run(
      nub,
      ["scripts/verify-package.ts", "--app-asar", appAsarPath],
      desktopRoot,
    );
    for (const artifact of target.artifacts) {
      const artifactPath = resolve(releaseRoot, artifact);
      requireArtifact(artifactPath);
      releaseArtifacts.push({
        target: target.id,
        path: relative(releaseRoot, artifactPath),
        bytes: statSync(artifactPath).size,
        sha256: await sha256(artifactPath),
      });
    }
  }

  const git = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (git.status !== 0)
    throw new Error("Unable to resolve the release commit.");
  const outputPath = resolve(releaseRoot, "release-manifest.json");
  writeFileSync(
    outputPath,
    `${JSON.stringify(
      {
        version: manifest.version,
        commit: git.stdout.trim(),
        generatedAt: new Date().toISOString(),
        host: `${process.platform}-${process.arch}`,
        artifacts: releaseArtifacts,
      },
      null,
      2,
    )}\n`,
  );

  console.log(`\nAll desktop release targets passed verification:`);
  for (const artifact of releaseArtifacts) {
    console.log(
      `  ${artifact.target.padEnd(5)} ${basename(artifact.path)} (${(artifact.bytes / 1024 / 1024).toFixed(1)} MiB)`,
    );
  }
  console.log(`  manifest ${relative(repoRoot, outputPath)}`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}

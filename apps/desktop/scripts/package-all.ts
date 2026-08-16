import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  createReadStream,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertPackageSourceUnchanged,
  nativeReceiptName,
  requireCleanPackageSource,
  writeNativePackageReceipt,
} from "./package-provenance";

const desktopRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const releaseRoot = resolve(desktopRoot, "release");
const wineCheckArgs = ["--version"] as const;
const versionedReleaseArtifact =
  /^Doolittle-\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?-(?:mac|win|linux)-(?:arm64|x64|x86_64|amd64|ia32)\.(?:AppImage|deb|dmg|exe|zip)(?:\.blockmap)?$/u;

type DesktopManifest = { version: string };
type RuntimeManifest = { nativePackages?: string[] };

export const allPlatformInstallArgs = [
  "install",
  "--frozen-lockfile",
  "--ignore-scripts",
  "--os",
  "darwin,win32,linux",
  "--cpu",
  "arm64,x64",
  "--libc",
  "glibc",
] as const;

export type ReleaseTarget = {
  id: "mac" | "win" | "linux";
  builderArgs: string[];
  artifacts: string[];
  appAsarCandidates: string[];
  cleanupPaths: string[];
};

export function releaseTargetReceipt(target: ReleaseTarget): {
  platform: "linux" | "macos" | "windows";
  artifacts: string[];
} {
  if (target.id === "mac") {
    return {
      platform: "macos",
      artifacts: [
        ...target.artifacts.flatMap((artifact) => [
          artifact,
          `${artifact}.blockmap`,
        ]),
        "latest-mac.yml",
      ],
    };
  }
  if (target.id === "win") {
    const installer = target.artifacts[0];
    if (!installer) throw new Error("Windows release target is incomplete.");
    return {
      platform: "windows",
      artifacts: [installer, `${installer}.blockmap`, "latest.yml"],
    };
  }
  return {
    platform: "linux",
    artifacts: [...target.artifacts, "latest-linux.yml"],
  };
}

export function releaseChecksumText(
  artifacts: readonly { path: string; sha256: string }[],
): string {
  return `${artifacts
    .map((artifact) => `${artifact.sha256}  ${artifact.path}`)
    .join("\n")}\n`;
}

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
      builderArgs: ["--linux", "AppImage", "deb", "--x64"],
      artifacts: [
        `Doolittle-${version}-linux-x64.AppImage`,
        `Doolittle-${version}-linux-x64.deb`,
      ],
      appAsarCandidates: [
        "linux-x64-unpacked/resources/app.asar",
        "linux-unpacked/resources/app.asar",
      ],
      cleanupPaths: [
        "linux-x64-unpacked",
        "linux-unpacked",
        `Doolittle-${version}-linux-x86_64.AppImage`,
        `Doolittle-${version}-linux-amd64.deb`,
      ],
    },
  ];
}

export function requiredNativeTargetPackages(hostArch: string): string[] {
  return [
    `@lydell/node-pty-darwin-${hostArch}`,
    "@lydell/node-pty-linux-x64",
    "@lydell/node-pty-win32-x64",
    `@snazzah/davey-darwin-${hostArch}`,
    "@snazzah/davey-linux-x64-gnu",
    "@snazzah/davey-win32-x64-msvc",
  ].sort();
}

export function missingNativeTargetPackages(
  required: readonly string[],
  packaged: readonly string[],
): string[] {
  const available = new Set(packaged);
  return required.filter((packageName) => !available.has(packageName));
}

export function supersededReleaseOutputNames(
  entries: readonly string[],
  targets: readonly ReleaseTarget[],
): string[] {
  const activeArtifacts = new Set(
    targets.flatMap((target) => [
      ...target.artifacts,
      ...target.artifacts.map((artifact) => `${artifact}.blockmap`),
    ]),
  );
  const activeDirectories = new Set(
    targets.flatMap((target) => target.cleanupPaths),
  );

  return entries.filter((entry) => {
    if (versionedReleaseArtifact.test(entry)) {
      return !activeArtifacts.has(entry);
    }
    if (/^latest-.+-(?:arm64|x64|ia32)\.yml$/u.test(entry)) return true;
    if (/^mac-(?:arm64|x64)$/u.test(entry)) {
      return !activeDirectories.has(entry);
    }
    if (/^(?:win|linux)-(?:arm64|x64|ia32)-unpacked$/u.test(entry)) {
      return !activeDirectories.has(entry);
    }
    return entry === ".DS_Store";
  });
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

export function macAppBundlePath(appAsarPath: string): string {
  return resolve(dirname(appAsarPath), "../..");
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

export function validatePackageHost({
  platform = process.platform,
  arch = process.arch,
  checkWine = () => {
    const wine = spawnSync("wine", wineCheckArgs, { stdio: "ignore" });
    return wine.status;
  },
}: {
  platform?: NodeJS.Platform;
  arch?: string;
  checkWine?: () => number | null | undefined;
}): void {
  if (platform !== "darwin") {
    throw new Error(
      "desktop:package:all is supported only on macOS arm64 hosts.",
    );
  }
  if (arch !== "arm64") {
    throw new Error(
      `desktop:package:all requires an Apple Silicon macOS host. Current host is ${platform}-${arch}.`,
    );
  }
  if (checkWine() !== 0) {
    throw new Error(
      "Windows cross-packaging requires Wine. Install Wine, then rerun `nub run desktop:package:all`.",
    );
  }
}

function requireAllBuildHost(): void {
  validatePackageHost({});
}

function cleanTarget(root: string, target: ReleaseTarget): void {
  for (const path of [
    ...target.cleanupPaths,
    ...target.artifacts,
    ...target.artifacts.map((artifact) => `${artifact}.blockmap`),
  ]) {
    rmSync(resolve(root, path), { force: true, recursive: true });
  }
}

function cleanSupersededReleaseOutputs(
  root: string,
  targets: ReleaseTarget[],
): void {
  if (!existsSync(root)) return;
  for (const entry of supersededReleaseOutputNames(
    readdirSync(root),
    targets,
  )) {
    rmSync(resolve(root, entry), { force: true, recursive: true });
  }
}

function isManagedReleaseEntry(entry: string): boolean {
  return (
    versionedReleaseArtifact.test(entry) ||
    /^latest(?:-.+)?\.yml$/u.test(entry) ||
    /^desktop-provenance-(?:linux|macos|windows)\.json$/u.test(entry) ||
    /^(?:mac(?:-.+)?|(?:win|linux)(?:-.+)?-unpacked)$/u.test(entry) ||
    [
      ".DS_Store",
      "SHA256SUMS.txt",
      "builder-debug.yml",
      "builder-effective-config.yaml",
      "release-manifest.json",
      "unpacked-manifest.json",
    ].includes(entry)
  );
}

function preserveOperatorReleaseEntries(
  currentRoot: string,
  stagingRoot: string,
): void {
  if (!existsSync(currentRoot)) return;
  for (const entry of readdirSync(currentRoot)) {
    if (isManagedReleaseEntry(entry)) continue;
    const destination = resolve(stagingRoot, entry);
    if (existsSync(destination)) continue;
    cpSync(resolve(currentRoot, entry), destination, { recursive: true });
  }
}

function seedStagingReleaseEntries(
  currentRoot: string,
  stagingRoot: string,
): void {
  if (!existsSync(currentRoot)) return;
  for (const entry of readdirSync(currentRoot)) {
    cpSync(resolve(currentRoot, entry), resolve(stagingRoot, entry), {
      recursive: true,
    });
  }
}

function promoteStagedRelease(stagingRoot: string, currentRoot: string): void {
  preserveOperatorReleaseEntries(currentRoot, stagingRoot);
  const backupRoot = `${currentRoot}.backup-${process.pid}-${Date.now()}`;
  let currentMoved = false;
  try {
    if (existsSync(currentRoot)) {
      renameSync(currentRoot, backupRoot);
      currentMoved = true;
    }
    renameSync(stagingRoot, currentRoot);
  } catch (error) {
    if (!existsSync(currentRoot) && currentMoved && existsSync(backupRoot)) {
      renameSync(backupRoot, currentRoot);
    }
    throw error;
  }
  if (currentMoved) {
    rmSync(backupRoot, { force: true, recursive: true });
  }
}

export async function withTransactionalReleaseDirectory<T>(
  currentRoot: string,
  build: (stagingRoot: string) => Promise<T>,
  options: { seedCurrentEntries?: boolean } = {},
): Promise<T> {
  const stagingRoot = mkdtempSync(
    resolve(dirname(currentRoot), `.${basename(currentRoot)}-staging-`),
  );
  try {
    if (options.seedCurrentEntries) {
      seedStagingReleaseEntries(currentRoot, stagingRoot);
    }
    const result = await build(stagingRoot);
    promoteStagedRelease(stagingRoot, currentRoot);
    return result;
  } catch (error) {
    rmSync(stagingRoot, { force: true, recursive: true });
    throw error;
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
  const packageCommit = requireCleanPackageSource(repoRoot);
  const manifest = JSON.parse(
    readFileSync(resolve(desktopRoot, "package.json"), "utf8"),
  ) as DesktopManifest;
  const targets = releaseTargets(manifest.version, process.arch);
  const requiredNativePackages = requiredNativeTargetPackages(process.arch);
  const nub = resolve(repoRoot, "node_modules", ".bin", "nub");
  const nubx = resolve(repoRoot, "node_modules", ".bin", "nubx");

  const result = await withTransactionalReleaseDirectory(
    releaseRoot,
    async (stagingRoot) => {
      cleanSupersededReleaseOutputs(stagingRoot, targets);
      for (const target of targets) cleanTarget(stagingRoot, target);
      rmSync(resolve(stagingRoot, "release-manifest.json"), { force: true });
      rmSync(resolve(stagingRoot, "SHA256SUMS.txt"), { force: true });
      for (const platform of ["linux", "macos", "windows"] as const) {
        rmSync(resolve(stagingRoot, nativeReceiptName(platform)), {
          force: true,
        });
      }

      run(nub, [...allPlatformInstallArgs]);
      run(nub, ["run", "build"], desktopRoot);
      run(nub, ["run", "runtime:prepare"], desktopRoot);
      const runtimeManifest = JSON.parse(
        readFileSync(
          resolve(desktopRoot, "build/runtime/runtime-manifest.json"),
          "utf8",
        ),
      ) as RuntimeManifest;
      const missingNativePackages = missingNativeTargetPackages(
        requiredNativePackages,
        runtimeManifest.nativePackages ?? [],
      );
      if (missingNativePackages.length > 0) {
        throw new Error(
          `Bundled runtime is missing target-native packages: ${missingNativePackages.join(", ")}`,
        );
      }

      const releaseArtifacts: Array<{
        target: ReleaseTarget["id"];
        path: string;
        bytes: number;
        sha256: string;
      }> = [];
      const unpackedPackages: Array<{
        target: ReleaseTarget["id"];
        appAsarPath: string;
        bytes: number;
        sha256: string;
      }> = [];
      for (const target of targets) {
        assertPackageSourceUnchanged(repoRoot, packageCommit);
        run(
          nubx,
          [
            "electron-builder",
            ...target.builderArgs,
            `--config.directories.output=${stagingRoot}`,
            "--publish",
            "never",
          ],
          desktopRoot,
        );
        assertPackageSourceUnchanged(repoRoot, packageCommit);
        const appAsarPath = resolveSingleExistingPath(
          stagingRoot,
          target.appAsarCandidates,
        );
        run(
          nub,
          ["scripts/verify-package.ts", "--app-asar", appAsarPath],
          desktopRoot,
        );
        if (target.id === "mac") {
          run(
            nub,
            [
              "scripts/verify-package.ts",
              "--verify-signature",
              macAppBundlePath(appAsarPath),
            ],
            desktopRoot,
          );
        }
        unpackedPackages.push({
          target: target.id,
          appAsarPath: relative(stagingRoot, appAsarPath),
          bytes: statSync(appAsarPath).size,
          sha256: await sha256(appAsarPath),
        });
        for (const artifact of target.artifacts) {
          const artifactPath = resolve(stagingRoot, artifact);
          requireArtifact(artifactPath);
          releaseArtifacts.push({
            target: target.id,
            path: relative(stagingRoot, artifactPath),
            bytes: statSync(artifactPath).size,
            sha256: await sha256(artifactPath),
          });
        }
        const receipt = releaseTargetReceipt(target);
        for (const artifact of receipt.artifacts) {
          requireArtifact(resolve(stagingRoot, artifact));
        }
        writeNativePackageReceipt({
          releaseDirectory: stagingRoot,
          platform: receipt.platform,
          commit: packageCommit,
          appAsarPath,
          artifactPaths: receipt.artifacts,
        });
      }

      assertPackageSourceUnchanged(repoRoot, packageCommit);
      writeFileSync(
        resolve(stagingRoot, "release-manifest.json"),
        `${JSON.stringify(
          {
            version: manifest.version,
            commit: packageCommit,
            generatedAt: new Date().toISOString(),
            host: `${process.platform}-${process.arch}`,
            nativePackages: requiredNativePackages,
            unpackedPackages,
            artifacts: releaseArtifacts,
          },
          null,
          2,
        )}\n`,
      );
      writeFileSync(
        resolve(stagingRoot, "SHA256SUMS.txt"),
        releaseChecksumText(releaseArtifacts),
      );
      return { releaseArtifacts };
    },
  );

  console.log(`\nAll desktop release targets passed verification:`);
  for (const artifact of result.releaseArtifacts) {
    console.log(
      `  ${artifact.target.padEnd(5)} ${basename(artifact.path)} (${(artifact.bytes / 1024 / 1024).toFixed(1)} MiB)`,
    );
  }
  console.log(
    `  manifest ${relative(repoRoot, resolve(releaseRoot, "release-manifest.json"))}`,
  );
  console.log(
    `  checksums ${relative(repoRoot, resolve(releaseRoot, "SHA256SUMS.txt"))}`,
  );
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}

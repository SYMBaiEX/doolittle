import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  macAppBundlePath,
  type ReleaseTarget,
  releaseTargetReceipt,
  releaseTargets,
  resolveSingleExistingPath,
  withTransactionalReleaseDirectory,
} from "./package-all";
import {
  assertPackageSourceUnchanged,
  requireCleanPackageSource,
  writeNativePackageReceipt,
} from "./package-provenance";

const desktopRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const args = process.argv.slice(2);
const env = { ...process.env };
const unpackedDirectories =
  process.platform === "darwin"
    ? [
        resolve(desktopRoot, "release", `mac-${process.arch}`),
        resolve(desktopRoot, "release", "mac"),
      ]
    : process.platform === "win32"
      ? [
          resolve(desktopRoot, "release", `win-${process.arch}-unpacked`),
          resolve(desktopRoot, "release", "win-unpacked"),
        ]
      : [
          resolve(desktopRoot, "release", `linux-${process.arch}-unpacked`),
          resolve(desktopRoot, "release", "linux-unpacked"),
        ];

export function directoryBuildArgs(
  builderArgs: readonly string[],
  stagingRoot: string,
): string[] {
  return [...builderArgs, `--config.directories.output=${stagingRoot}`];
}

export function directoryBuildInvalidatedMetadataPaths(): string[] {
  return ["release-manifest.json"];
}

export function nativeBuildArgs(
  builderArgs: readonly string[],
  stagingRoot: string,
  environment: NodeJS.ProcessEnv = process.env,
): string[] {
  const windowsPublisherName = environment.WIN_PUBLISHER_NAME?.trim();
  return [
    ...builderArgs,
    ...(builderArgs.includes("--win") && windowsPublisherName
      ? [`--config.win.signtoolOptions.publisherName=${windowsPublisherName}`]
      : []),
    `--config.directories.output=${stagingRoot}`,
    "--publish",
    "never",
  ];
}

function selectedPlatform(
  builderArgs: readonly string[],
  platform: NodeJS.Platform,
): "darwin" | "win32" | "linux" {
  const requested = [
    ["--mac", "darwin"],
    ["--win", "win32"],
    ["--linux", "linux"],
  ].flatMap(([flag, target]) =>
    builderArgs.includes(flag) ? [target as "darwin" | "win32" | "linux"] : [],
  );
  if (requested.length > 1) {
    throw new Error(
      "Native desktop packaging supports one platform target at a time. Use desktop:package:all for a multi-platform release.",
    );
  }
  if (requested.length === 1) return requested[0] ?? "darwin";
  if (platform === "darwin" || platform === "win32" || platform === "linux") {
    return platform;
  }
  throw new Error(
    `Unsupported native desktop packaging platform: ${platform}.`,
  );
}

export function nativeReleaseTargetForArgs(
  builderArgs: readonly string[],
  version: string,
  hostArch: string,
  platform: NodeJS.Platform = process.platform,
): ReleaseTarget {
  const selected = selectedPlatform(builderArgs, platform);
  const macArch = builderArgs.includes("--x64")
    ? "x64"
    : builderArgs.includes("--arm64")
      ? "arm64"
      : hostArch;
  const target = releaseTargets(version, macArch).find((candidate) =>
    selected === "darwin"
      ? candidate.id === "mac"
      : selected === "win32"
        ? candidate.id === "win"
        : candidate.id === "linux",
  );
  if (!target) {
    throw new Error(`Unable to resolve the ${selected} release target.`);
  }
  return target;
}

function cleanNativeTarget(root: string, target: ReleaseTarget): void {
  const receipt = releaseTargetReceipt(target);
  for (const path of nativeMetadataPathsFor(target)) {
    rmSync(resolve(root, path), { force: true, recursive: true });
  }
  for (const path of [
    ...target.cleanupPaths,
    ...target.artifacts,
    ...target.artifacts.map((artifact) => `${artifact}.blockmap`),
    ...receipt.artifacts.filter((artifact) => artifact.endsWith(".yml")),
    `desktop-provenance-${receipt.platform}.json`,
  ]) {
    rmSync(resolve(root, path), { force: true, recursive: true });
  }
}

export function nativeMetadataPathsFor(
  target: ReleaseTarget,
  platform: NodeJS.Platform = process.platform,
): string[] {
  const paths = ["release-manifest.json", "SHA256SUMS.txt"];
  const targetMatchesHost =
    (target.id === "mac" && platform === "darwin") ||
    (target.id === "win" && platform === "win32") ||
    (target.id === "linux" && platform === "linux");
  if (targetMatchesHost) paths.push("unpacked-manifest.json");
  return paths;
}

export function requireNativeReleaseArtifacts(
  releaseRoot: string,
  target: ReleaseTarget,
): void {
  const receipt = releaseTargetReceipt(target);
  for (const artifact of receipt.artifacts) {
    const artifactPath = resolve(releaseRoot, artifact);
    if (
      !existsSync(artifactPath) ||
      !statSync(artifactPath).isFile() ||
      statSync(artifactPath).size === 0
    ) {
      throw new Error(
        `Expected native release artifact is missing or empty: ${artifactPath}`,
      );
    }
  }
}

function unpackedDirectoriesFor(releaseRoot: string): string[] {
  return unpackedDirectories.map((directory) =>
    resolve(releaseRoot, relative(resolve(desktopRoot, "release"), directory)),
  );
}

if (
  args.includes("--dir") &&
  process.platform === "darwin" &&
  env.CSC_IDENTITY_AUTO_DISCOVERY === undefined
) {
  env.CSC_IDENTITY_AUTO_DISCOVERY = "false";
}

const localNubx = resolve(
  repoRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "nubx.cmd" : "nubx",
);
function verifyPackagedApp(appAsarPath?: string): number | null {
  const localNub = resolve(
    repoRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "nub.cmd" : "nub",
  );
  const verification = spawnSync(
    existsSync(localNub) ? localNub : "nub",
    [
      "scripts/verify-package.ts",
      ...(appAsarPath ? ["--app-asar", appAsarPath] : []),
    ],
    { cwd: desktopRoot, env, stdio: "inherit" },
  );
  return verification.status;
}

function verifyPackagedAppSignature(appBundlePath: string): number | null {
  const localNub = resolve(
    repoRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "nub.cmd" : "nub",
  );
  const verification = spawnSync(
    existsSync(localNub) ? localNub : "nub",
    ["scripts/verify-package.ts", "--verify-signature", appBundlePath],
    { cwd: desktopRoot, env, stdio: "inherit" },
  );
  return verification.status;
}

async function packageDirectoryBuild(): Promise<void> {
  const releaseRoot = resolve(desktopRoot, "release");
  const packageCommit = requireCleanPackageSource(repoRoot);
  await withTransactionalReleaseDirectory(
    releaseRoot,
    async (stagingRoot) => {
      for (const directory of unpackedDirectoriesFor(stagingRoot)) {
        rmSync(directory, { force: true, recursive: true });
      }
      rmSync(resolve(stagingRoot, "unpacked-manifest.json"), { force: true });
      for (const path of directoryBuildInvalidatedMetadataPaths()) {
        rmSync(resolve(stagingRoot, path), { force: true });
      }
      const result = spawnSync(
        existsSync(localNubx) ? localNubx : "nubx",
        ["electron-builder", ...directoryBuildArgs(args, stagingRoot)],
        { cwd: desktopRoot, env, stdio: "inherit" },
      );
      if (result.status !== 0) {
        throw new Error(
          `electron-builder directory build failed with exit code ${result.status ?? "unknown"}.`,
        );
      }
      const appAsarCandidates = unpackedDirectoriesFor(stagingRoot).map(
        (directory) =>
          process.platform === "darwin"
            ? resolve(directory, "Doolittle.app/Contents/Resources/app.asar")
            : resolve(directory, "resources/app.asar"),
      );
      const appAsarPath = appAsarCandidates.find(existsSync);
      if (!appAsarPath) {
        throw new Error(
          "Packaged app.asar is missing after the directory build.",
        );
      }
      if (verifyPackagedApp(appAsarPath) !== 0) {
        throw new Error("Directory package verification failed.");
      }
      assertPackageSourceUnchanged(repoRoot, packageCommit);
      const contents = readFileSync(appAsarPath);
      writeFileSync(
        resolve(stagingRoot, "unpacked-manifest.json"),
        `${JSON.stringify(
          {
            commit: packageCommit,
            generatedAt: new Date().toISOString(),
            host: `${process.platform}-${process.arch}`,
            appAsarPath: relative(stagingRoot, appAsarPath),
            bytes: statSync(appAsarPath).size,
            sha256: createHash("sha256").update(contents).digest("hex"),
          },
          null,
          2,
        )}\n`,
      );
    },
    { seedCurrentEntries: true },
  );
}

export async function withTransactionalNativePackage<T>(
  releaseRoot: string,
  target: ReleaseTarget,
  build: (stagingRoot: string) => Promise<T>,
): Promise<T> {
  return withTransactionalReleaseDirectory(
    releaseRoot,
    async (stagingRoot) => {
      cleanNativeTarget(stagingRoot, target);
      return build(stagingRoot);
    },
    { seedCurrentEntries: true },
  );
}

function desktopPackageVersion(): string {
  const manifest = JSON.parse(
    readFileSync(resolve(desktopRoot, "package.json"), "utf8"),
  ) as { version?: unknown };
  if (typeof manifest.version !== "string" || manifest.version.length === 0) {
    throw new Error("Desktop package.json must declare a package version.");
  }
  return manifest.version;
}

async function packageNativeBuild(): Promise<void> {
  const releaseRoot = resolve(desktopRoot, "release");
  const packageCommit = requireCleanPackageSource(repoRoot);
  const target = nativeReleaseTargetForArgs(
    args,
    desktopPackageVersion(),
    process.arch,
  );
  await withTransactionalNativePackage(
    releaseRoot,
    target,
    async (stagingRoot) => {
      const result = spawnSync(
        existsSync(localNubx) ? localNubx : "nubx",
        ["electron-builder", ...nativeBuildArgs(args, stagingRoot)],
        { cwd: desktopRoot, env, stdio: "inherit" },
      );
      if (result.status !== 0) {
        throw new Error(
          `electron-builder native package build failed with exit code ${result.status ?? "unknown"}.`,
        );
      }
      const appAsarPath = resolveSingleExistingPath(
        stagingRoot,
        target.appAsarCandidates,
      );
      if (verifyPackagedApp(appAsarPath) !== 0) {
        throw new Error("Native package verification failed.");
      }
      if (
        target.id === "mac" &&
        verifyPackagedAppSignature(macAppBundlePath(appAsarPath)) !== 0
      ) {
        throw new Error("Native macOS signature verification failed.");
      }
      assertPackageSourceUnchanged(repoRoot, packageCommit);
      const receipt = releaseTargetReceipt(target);
      requireNativeReleaseArtifacts(stagingRoot, target);
      writeNativePackageReceipt({
        releaseDirectory: stagingRoot,
        platform: receipt.platform,
        commit: packageCommit,
        appAsarPath,
        artifactPaths: receipt.artifacts,
      });
    },
  );
}

async function main(): Promise<void> {
  if (args.includes("--dir")) {
    await packageDirectoryBuild();
    return;
  }
  await packageNativeBuild();
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) await main();

import {
  existsSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareDesktopArtifact } from "./desktop-artifact";
import { desktopSbomName } from "./desktop-sbom";
import {
  buildDesktopPackageInputs,
  macAppBundlePath,
  packageBuilderArgs,
  type ReleaseTarget,
  releaseTargetReceipt,
  releaseTargets,
  resolveSingleExistingPath,
  runPackagingTool,
  withTransactionalReleaseDirectory,
} from "./package-all";
import {
  assertPackageSourceUnchanged,
  gitCommitCreatedAt,
  packageProvenanceArtifact,
  requireCleanPackageSource,
  writeNativePackageReceipt,
} from "./package-provenance";

const desktopRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const args = process.argv.slice(2).filter((arg) => arg !== "--");
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
    desktopSbomName(receipt.platform),
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

async function packageDirectoryBuild(packageCommit: string): Promise<void> {
  const releaseRoot = resolve(desktopRoot, "release");
  await withTransactionalReleaseDirectory(
    releaseRoot,
    async (stagingRoot) => {
      for (const directory of unpackedDirectoriesFor(stagingRoot)) {
        rmSync(directory, { force: true, recursive: true });
      }
      rmSync(resolve(stagingRoot, "unpacked-manifest.json"), { force: true });
      rmSync(resolve(stagingRoot, "release-manifest.json"), { force: true });
      rmSync(resolve(stagingRoot, "SHA256SUMS.txt"), { force: true });
      prepareDesktopArtifact({ desktopRoot, repoRoot });
      runPackagingTool(
        "electron-builder",
        packageBuilderArgs(args, stagingRoot),
        { env },
      );
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
      runPackagingTool(
        "nub",
        ["scripts/verify-package.ts", "--app-asar", appAsarPath],
        { env },
      );
      assertPackageSourceUnchanged(repoRoot, packageCommit);
      const artifact = packageProvenanceArtifact(stagingRoot, appAsarPath);
      writeFileSync(
        resolve(stagingRoot, "unpacked-manifest.json"),
        `${JSON.stringify(
          {
            commit: packageCommit,
            generatedAt: new Date().toISOString(),
            host: `${process.platform}-${process.arch}`,
            appAsarPath: artifact.path,
            bytes: artifact.bytes,
            sha256: artifact.sha256,
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

async function packageNativeBuild(packageCommit: string): Promise<void> {
  const releaseRoot = resolve(desktopRoot, "release");
  const target = nativeReleaseTargetForArgs(
    args,
    desktopPackageVersion(),
    process.arch,
  );
  await withTransactionalNativePackage(
    releaseRoot,
    target,
    async (stagingRoot) => {
      prepareDesktopArtifact({ desktopRoot, repoRoot });
      runPackagingTool(
        "electron-builder",
        packageBuilderArgs(args, stagingRoot, target.id),
        { env },
      );
      const appAsarPath = resolveSingleExistingPath(
        stagingRoot,
        target.appAsarCandidates,
      );
      runPackagingTool(
        "nub",
        ["scripts/verify-package.ts", "--app-asar", appAsarPath],
        { env },
      );
      if (target.id === "mac") {
        runPackagingTool(
          "nub",
          [
            "scripts/verify-package.ts",
            "--verify-signature",
            macAppBundlePath(appAsarPath),
          ],
          { env },
        );
      }
      assertPackageSourceUnchanged(repoRoot, packageCommit);
      const receipt = releaseTargetReceipt(target);
      requireNativeReleaseArtifacts(stagingRoot, target);
      writeNativePackageReceipt({
        releaseDirectory: stagingRoot,
        platform: receipt.platform,
        commit: packageCommit,
        createdAt: gitCommitCreatedAt(repoRoot, packageCommit),
        appAsarPath,
        artifactPaths: receipt.artifacts,
      });
    },
  );
}

async function main(): Promise<void> {
  const packageCommit = requireCleanPackageSource(repoRoot);
  buildDesktopPackageInputs(packageCommit);
  if (args.includes("--dir")) {
    await packageDirectoryBuild(packageCommit);
    return;
  }
  await packageNativeBuild(packageCommit);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) await main();

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

export type GitCommandResult = {
  status: number | null;
  stdout: string;
};

export type GitCommandRunner = (args: string[]) => GitCommandResult;

export type PackageProvenanceArtifact = {
  path: string;
  bytes: number;
  sha256: string;
};

/**
 * A platform-local, content-addressed runtime tree. It deliberately excludes
 * timestamps and ownership because installers and archive tools rewrite both.
 */
export type PackageProvenanceRuntime = {
  path: string;
  entries: number;
  bytes: number;
  sha256: string;
};

export type NativePackageReceipt = {
  schemaVersion: 2;
  platform: "linux" | "macos" | "windows";
  commit: string;
  appAsar: PackageProvenanceArtifact;
  runtime: PackageProvenanceRuntime;
  artifacts: PackageProvenanceArtifact[];
};

const COMMIT_SHA = /^[0-9a-f]{40}$/u;

export function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function packageProvenanceArtifact(
  releaseDirectory: string,
  path: string,
): PackageProvenanceArtifact {
  const absolutePath = resolve(releaseDirectory, path);
  return {
    path: relative(releaseDirectory, absolutePath),
    bytes: statSync(absolutePath).size,
    sha256: sha256File(absolutePath),
  };
}

function portableRelativePath(root: string, path: string): string {
  const result = relative(root, path);
  if (!result || result.startsWith("..") || resolve(root, result) !== path) {
    throw new Error(`Runtime entry escapes its root: ${path}`);
  }
  return result.split(sep).join("/");
}

/**
 * Computes a stable digest of the exact runtime payload. Regular-file bytes
 * and symlink targets are bound; directories are included so empty runtime
 * directories cannot be added or removed without changing the receipt.
 */
export function packageProvenanceRuntime(
  releaseDirectory: string,
  runtimeDirectory: string,
): PackageProvenanceRuntime {
  const absoluteRuntimeDirectory = resolve(releaseDirectory, runtimeDirectory);
  const root = lstatSync(absoluteRuntimeDirectory);
  if (!root.isDirectory() || root.isSymbolicLink()) {
    throw new Error(
      `Packaged runtime directory is invalid: ${runtimeDirectory}`,
    );
  }

  const records: string[] = [];
  let bytes = 0;
  let entries = 0;
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory).sort()) {
      const absoluteEntry = resolve(directory, entry);
      const relativeEntry = portableRelativePath(
        absoluteRuntimeDirectory,
        absoluteEntry,
      );
      const status = lstatSync(absoluteEntry);
      entries += 1;
      if (status.isDirectory()) {
        records.push(`D\0${relativeEntry}\n`);
        visit(absoluteEntry);
      } else if (status.isFile()) {
        bytes += status.size;
        records.push(
          `F\0${relativeEntry}\0${status.size}\0${sha256File(absoluteEntry)}\n`,
        );
      } else if (status.isSymbolicLink()) {
        records.push(`L\0${relativeEntry}\0${readlinkSync(absoluteEntry)}\n`);
      } else {
        throw new Error(
          `Packaged runtime contains unsupported entry: ${relativeEntry}`,
        );
      }
    }
  };
  visit(absoluteRuntimeDirectory);
  if (entries === 0) {
    throw new Error(`Packaged runtime directory is empty: ${runtimeDirectory}`);
  }

  return {
    path: relative(releaseDirectory, absoluteRuntimeDirectory)
      .split(sep)
      .join("/"),
    entries,
    bytes,
    sha256: createHash("sha256").update(records.join("")).digest("hex"),
  };
}

export function runtimeDirectoryForAppAsar(appAsarPath: string): string {
  return join(dirname(appAsarPath), "runtime");
}

export function nativeReceiptName(
  platform: NativePackageReceipt["platform"],
): string {
  return `desktop-provenance-${platform}.json`;
}

export function writeNativePackageReceipt({
  releaseDirectory,
  platform,
  commit,
  appAsarPath,
  runtimeDirectory = runtimeDirectoryForAppAsar(appAsarPath),
  artifactPaths,
}: {
  releaseDirectory: string;
  platform: NativePackageReceipt["platform"];
  commit: string;
  appAsarPath: string;
  runtimeDirectory?: string;
  artifactPaths: string[];
}): NativePackageReceipt {
  if (!COMMIT_SHA.test(commit)) {
    throw new Error(`Invalid package source commit: ${commit}`);
  }
  const receipt: NativePackageReceipt = {
    schemaVersion: 2,
    platform,
    commit,
    appAsar: packageProvenanceArtifact(releaseDirectory, appAsarPath),
    runtime: packageProvenanceRuntime(releaseDirectory, runtimeDirectory),
    artifacts: artifactPaths.map((path) =>
      packageProvenanceArtifact(releaseDirectory, path),
    ),
  };
  writeFileSync(
    resolve(releaseDirectory, nativeReceiptName(platform)),
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
  return receipt;
}

function requiredArgument(args: string[], name: string): string {
  const index = args.indexOf(name);
  const value = index === -1 ? undefined : args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing ${name}.`);
  return value;
}

export function writeNativePackageReceiptFromArgs(
  args: string[],
): NativePackageReceipt {
  const artifactPaths = args
    .flatMap((argument, index) =>
      argument === "--artifact" ? [args[index + 1]] : [],
    )
    .filter((path): path is string => Boolean(path && !path.startsWith("--")));
  if (artifactPaths.length === 0)
    throw new Error("At least one --artifact is required.");
  return writeNativePackageReceipt({
    releaseDirectory: requiredArgument(args, "--release-directory"),
    platform: requiredArgument(
      args,
      "--platform",
    ) as NativePackageReceipt["platform"],
    commit: requiredArgument(args, "--commit"),
    appAsarPath: requiredArgument(args, "--app-asar"),
    runtimeDirectory: args.includes("--runtime-directory")
      ? requiredArgument(args, "--runtime-directory")
      : undefined,
    artifactPaths,
  });
}

export function verifyNativePackageRuntime({
  releaseDirectory,
  platform,
  runtimeDirectory,
}: {
  releaseDirectory: string;
  platform: NativePackageReceipt["platform"];
  runtimeDirectory: string;
}): PackageProvenanceRuntime {
  const receiptPath = resolve(releaseDirectory, nativeReceiptName(platform));
  let receipt: NativePackageReceipt;
  try {
    receipt = JSON.parse(
      readFileSync(receiptPath, "utf8"),
    ) as NativePackageReceipt;
  } catch {
    throw new Error(
      `Missing or invalid native provenance receipt: ${nativeReceiptName(platform)}.`,
    );
  }
  if (receipt.schemaVersion !== 2 || receipt.platform !== platform) {
    throw new Error(
      `Invalid native provenance receipt: ${nativeReceiptName(platform)}.`,
    );
  }
  const runtime = packageProvenanceRuntime(releaseDirectory, runtimeDirectory);
  if (
    receipt.runtime.entries !== runtime.entries ||
    receipt.runtime.bytes !== runtime.bytes ||
    receipt.runtime.sha256 !== runtime.sha256
  ) {
    throw new Error(
      `Packaged runtime does not match ${nativeReceiptName(platform)}.`,
    );
  }
  return runtime;
}

function runGit(repoRoot: string, args: string[]): GitCommandResult {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
  };
}

function readGitValue(
  args: string[],
  runner: GitCommandRunner,
  failureMessage: string,
): string {
  const result = runner(args);
  const value = result.stdout.trim();
  if (result.status !== 0 || value.length === 0) {
    throw new Error(failureMessage);
  }
  return value;
}

export function requireCleanPackageSource(
  repoRoot: string,
  runner: GitCommandRunner = (args) => runGit(repoRoot, args),
): string {
  const commit = readGitValue(
    ["rev-parse", "HEAD"],
    runner,
    "Unable to resolve the package source commit.",
  );
  const status = runner(["status", "--porcelain=v1", "--untracked-files=all"]);
  if (status.status !== 0) {
    throw new Error("Unable to verify the package source worktree.");
  }
  if (status.stdout.trim().length > 0) {
    throw new Error(
      "Desktop packages must be built from a clean worktree. Commit or stash source changes, then retry.",
    );
  }
  return commit;
}

export function assertPackageSourceUnchanged(
  repoRoot: string,
  expectedCommit: string,
  runner: GitCommandRunner = (args) => runGit(repoRoot, args),
): void {
  const actualCommit = requireCleanPackageSource(repoRoot, runner);
  if (actualCommit !== expectedCommit) {
    throw new Error(
      `Package source changed during the build: expected ${expectedCommit}, found ${actualCommit}.`,
    );
  }
}

if (process.argv.includes("--write-receipt")) {
  const receipt = writeNativePackageReceiptFromArgs(process.argv.slice(2));
  console.log(
    `Wrote ${basename(nativeReceiptName(receipt.platform))} for ${receipt.commit}.`,
  );
}

if (process.argv.includes("--verify-runtime-tree")) {
  const args = process.argv.slice(2);
  const runtime = verifyNativePackageRuntime({
    releaseDirectory: requiredArgument(args, "--release-directory"),
    platform: requiredArgument(
      args,
      "--platform",
    ) as NativePackageReceipt["platform"],
    runtimeDirectory: requiredArgument(args, "--runtime-directory"),
  });
  console.log(`Verified ${runtime.entries} packaged runtime entries.`);
}

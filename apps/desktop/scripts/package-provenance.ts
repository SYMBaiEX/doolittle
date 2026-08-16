import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, relative, resolve } from "node:path";

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

export type NativePackageReceipt = {
  schemaVersion: 1;
  platform: "linux" | "macos" | "windows";
  commit: string;
  appAsar: PackageProvenanceArtifact;
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
  artifactPaths,
}: {
  releaseDirectory: string;
  platform: NativePackageReceipt["platform"];
  commit: string;
  appAsarPath: string;
  artifactPaths: string[];
}): NativePackageReceipt {
  if (!COMMIT_SHA.test(commit)) {
    throw new Error(`Invalid package source commit: ${commit}`);
  }
  const receipt: NativePackageReceipt = {
    schemaVersion: 1,
    platform,
    commit,
    appAsar: packageProvenanceArtifact(releaseDirectory, appAsarPath),
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
    artifactPaths,
  });
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

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = fileURLToPath(new URL("..", import.meta.url));
const verifierPath = fileURLToPath(
  new URL("./verify-package.ts", import.meta.url),
);
const bundleIdentifier = "ai.doolittle.desktop";
const releaseTeamIdentifier = "3VZKJ253J2";

type FileSystem = Pick<
  typeof import("node:fs"),
  | "cpSync"
  | "existsSync"
  | "lstatSync"
  | "mkdirSync"
  | "readFileSync"
  | "realpathSync"
  | "renameSync"
  | "rmSync"
  | "statSync"
  | "writeFileSync"
>;

export type MacOSInstallTrustMode = "ad-hoc" | "release";
export type MacOSInstallOptions = {
  allowAdHoc?: boolean;
  destination?: string;
  fileSystem?: FileSystem;
  source?: string;
  readMetadata?: (appBundlePath: string) => AppMetadata;
  quiesce?: (destination: string) => void;
  verifyPackage?: (appBundlePath: string) => void;
  verifyTrust?: (
    appBundlePath: string,
    trustMode: MacOSInstallTrustMode,
  ) => void;
};
export type MacOSInstallResult = {
  destination: string;
  signatureVerified: boolean;
  source: string;
  trustMode: MacOSInstallTrustMode;
};
type AppIdentity = { appAsarSha256: string; runtimeManifestSha256: string };
type AppMetadata = {
  executable: string;
  identifier: string;
  shortVersion: string;
  version: string;
};

const nodeFileSystem: FileSystem = {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
};

function lstatOrNull(path: string, fileSystem: FileSystem) {
  try {
    return fileSystem.lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function pathIsInside(parent: string, candidate: string): boolean {
  const path = relative(parent, candidate);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

function sha256(contents: Buffer): string {
  return createHash("sha256").update(contents).digest("hex");
}

function assertSafeAppBundle(
  path: string,
  role: string,
  fileSystem: FileSystem,
  required: boolean,
): void {
  if (
    (role === "source" || role === "destination") &&
    basename(path) !== "Doolittle.app"
  ) {
    throw new Error(`${role} must be an app bundle: ${path}`);
  }
  const details = lstatOrNull(path, fileSystem);
  if (!details) {
    if (!required) return;
    throw new Error(`${role} app bundle does not exist: ${path}`);
  }
  if (details.isSymbolicLink()) {
    throw new Error(`${role} app bundle must not be a symbolic link: ${path}`);
  }
  if (!details.isDirectory()) {
    throw new Error(`${role} app bundle must be a directory: ${path}`);
  }
}

function assertSafeAbsentPath(
  path: string,
  role: string,
  fileSystem: FileSystem,
): void {
  const details = lstatOrNull(path, fileSystem);
  if (!details) return;
  if (details.isSymbolicLink()) {
    throw new Error(`${role} path must not be a symbolic link: ${path}`);
  }
  throw new Error(`${role} path already exists: ${path}`);
}

function resolveInstallPaths(
  source: string,
  destination: string,
  fileSystem: FileSystem,
) {
  const resolvedSource = resolve(source);
  const resolvedDestination = resolve(destination);
  assertSafeAppBundle(resolvedSource, "source", fileSystem, true);
  assertSafeAppBundle(resolvedDestination, "destination", fileSystem, false);
  const sourceRealPath = fileSystem.realpathSync(resolvedSource);
  const destinationParent = dirname(resolvedDestination);
  const parentDetails = lstatOrNull(destinationParent, fileSystem);
  if (!parentDetails) {
    throw new Error(`Destination parent does not exist: ${destinationParent}`);
  }
  if (parentDetails.isSymbolicLink()) {
    throw new Error(
      `Destination parent must not be a symbolic link: ${destinationParent}`,
    );
  }
  const destinationParentRealPath = fileSystem.realpathSync(destinationParent);
  const canonicalDestination = resolve(
    destinationParentRealPath,
    basename(resolvedDestination),
  );
  if (
    sourceRealPath === canonicalDestination ||
    pathIsInside(sourceRealPath, canonicalDestination) ||
    pathIsInside(canonicalDestination, sourceRealPath)
  ) {
    throw new Error("Source and destination app bundles must not overlap.");
  }
  return {
    destination: canonicalDestination,
    destinationParent: destinationParentRealPath,
    source: sourceRealPath,
  };
}

function appPath(appBundlePath: string, path: string): string {
  return resolve(appBundlePath, "Contents", path);
}

function defaultReadMetadata(appBundlePath: string): AppMetadata {
  const plist = appPath(appBundlePath, "Info.plist");
  const extract = (key: string): string => {
    const result = spawnSync("plutil", ["-extract", key, "raw", plist], {
      encoding: "utf8",
    });
    if (result.status !== 0 || !result.stdout.trim()) {
      throw new Error(`plutil could not read ${key} from ${plist}.`);
    }
    return result.stdout.trim();
  };
  return {
    executable: extract("CFBundleExecutable"),
    identifier: extract("CFBundleIdentifier"),
    shortVersion: extract("CFBundleShortVersionString"),
    version: extract("CFBundleVersion"),
  };
}

export function inspectMacOSAppIdentity(
  appBundlePath: string,
  fileSystem: Pick<FileSystem, "readFileSync" | "statSync"> = nodeFileSystem,
  readMetadata: (appBundlePath: string) => AppMetadata = defaultReadMetadata,
): AppIdentity {
  const metadata = readMetadata(appBundlePath);
  if (metadata.identifier !== bundleIdentifier) {
    throw new Error(
      `Unexpected macOS bundle identifier for ${appBundlePath}: ${metadata.identifier || "missing"}.`,
    );
  }
  if (!metadata.executable || !metadata.shortVersion || !metadata.version)
    throw new Error(`macOS app metadata is incomplete: ${appBundlePath}`);
  const executablePath = appPath(appBundlePath, `MacOS/${metadata.executable}`);
  if (!fileSystem.statSync(executablePath).isFile()) {
    throw new Error(`macOS app executable is missing: ${executablePath}`);
  }
  return {
    appAsarSha256: sha256(
      fileSystem.readFileSync(appPath(appBundlePath, "Resources/app.asar")),
    ),
    runtimeManifestSha256: sha256(
      fileSystem.readFileSync(
        appPath(appBundlePath, "Resources/runtime/bin/runtime-manifest.json"),
      ),
    ),
  };
}

function assertMatchingIdentity(
  expected: AppIdentity,
  actual: AppIdentity,
  role: "staged" | "promoted",
): void {
  if (
    expected.appAsarSha256 !== actual.appAsarSha256 ||
    expected.runtimeManifestSha256 !== actual.runtimeManifestSha256
  ) {
    throw new Error(
      `${role} app identity does not match the verified source app bundle.`,
    );
  }
}

function defaultVerifyPackage(appBundlePath: string): void {
  const result = spawnSync(
    "nub",
    [verifierPath, "--app-asar", appPath(appBundlePath, "Resources/app.asar")],
    {
      cwd: desktopRoot,
      stdio: "inherit",
    },
  );
  if (result.status !== 0)
    throw new Error(`Packaged app verification failed for ${appBundlePath}.`);
}

function copyMacOSApp(source: string, destination: string): void {
  const result = spawnSync("ditto", [source, destination], {
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`ditto failed while staging ${source} to ${destination}.`);
  }
}

function runRequired(
  command: string,
  args: string[],
  appBundlePath: string,
): string {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(
      `${command} verification failed for ${appBundlePath}: ${(result.stderr || result.stdout || "no output").trim()}`,
    );
  }
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

function defaultVerifyTrust(
  appBundlePath: string,
  trustMode: MacOSInstallTrustMode,
): void {
  const signatureMetadata = runRequired(
    "codesign",
    ["-dvv", appBundlePath],
    appBundlePath,
  );
  runRequired(
    "codesign",
    ["--verify", "--deep", "--strict", "--verbose=2", appBundlePath],
    appBundlePath,
  );
  if (trustMode === "ad-hoc") return;
  const teamIdentifier = signatureMetadata
    .match(/^TeamIdentifier=(.+)$/mu)?.[1]
    ?.trim();
  if (!teamIdentifier || teamIdentifier === "not set") {
    throw new Error(
      `Release app code signature has no TeamIdentifier: ${appBundlePath}`,
    );
  }
  if (teamIdentifier !== releaseTeamIdentifier) {
    throw new Error(
      `Release app TeamIdentifier mismatch for ${appBundlePath}: expected ${releaseTeamIdentifier}, received ${teamIdentifier}.`,
    );
  }
  const verifier = spawnSync(
    "nub",
    [verifierPath, "--verify-signature", appBundlePath],
    {
      cwd: desktopRoot,
      stdio: "inherit",
    },
  );
  if (verifier.status !== 0) {
    throw new Error(
      `Nested runtime signature verification failed for ${appBundlePath}.`,
    );
  }
  runRequired("xcrun", ["stapler", "validate", appBundlePath], appBundlePath);
  runRequired(
    "spctl",
    ["--assess", "--type", "execute", "--verbose=4", appBundlePath],
    appBundlePath,
  );
}

function uniqueSiblingPath(
  destinationParent: string,
  kind: "backup" | "failure" | "stage",
): string {
  return resolve(
    destinationParent,
    `.Doolittle.${kind}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.app`,
  );
}

function lockPath(destinationParent: string): string {
  return resolve(destinationParent, ".Doolittle.install.lock");
}

function journalPath(lock: string): string {
  return resolve(lock, "journal.json");
}

type InstallJournal = {
  backup: string;
  destination: string;
  failure: string;
  phase: "backup" | "promoted" | "promoting" | "staging";
  pid: number;
  source: string;
  stage: string;
};

function writeJournal(
  lock: string,
  journal: InstallJournal,
  fileSystem: FileSystem,
): void {
  fileSystem.writeFileSync(journalPath(lock), JSON.stringify(journal), "utf8");
}

function defaultQuiesce(destination: string): void {
  if (process.platform !== "darwin") return;
  spawnSync(
    "osascript",
    ["-e", `tell application id "${bundleIdentifier}" to quit`],
    { stdio: "ignore" },
  );
  const executable = appPath(destination, "MacOS/Doolittle");
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const app = spawnSync("pgrep", ["-f", executable], { stdio: "ignore" });
    const runtime = spawnSync(
      "pgrep",
      ["-f", appPath(destination, "Resources/runtime")],
      { stdio: "ignore" },
    );
    if (app.status !== 0 && runtime.status !== 0) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
  throw new Error(
    `Doolittle is still running and must be closed before installation: ${destination}`,
  );
}

/** Restores a stale, bounded installer transaction without deleting uncertain paths. */
export function recoverInterruptedMacOSInstall(
  lock: string,
  fileSystem: FileSystem = nodeFileSystem,
): void {
  const lockDetails = lstatOrNull(lock, fileSystem);
  if (!lockDetails) return;
  if (lockDetails.isSymbolicLink() || !lockDetails.isDirectory())
    throw new Error(`Unsafe install lock: ${lock}`);
  if (!lstatOrNull(journalPath(lock), fileSystem)) {
    throw new Error(
      `Another Doolittle installation is already running: ${lock}`,
    );
  }
  const journal = JSON.parse(
    fileSystem.readFileSync(journalPath(lock), "utf8"),
  ) as InstallJournal;
  if (!Number.isSafeInteger(journal.pid) || journal.pid <= 0) {
    throw new Error(`Unsafe stale install journal owner: ${journal.pid}`);
  }
  if (!["staging", "backup", "promoting", "promoted"].includes(journal.phase)) {
    throw new Error(`Unsafe stale install journal phase: ${journal.phase}`);
  }
  const parent = dirname(lock);
  const expectedPaths = [
    [journal.destination, /^Doolittle\.app$/u],
    [journal.stage, /^\.Doolittle\.stage-.+\.app$/u],
    [journal.backup, /^\.Doolittle\.backup-.+\.app$/u],
    [journal.failure, /^\.Doolittle\.failure-.+\.app$/u],
  ] as const;
  for (const [path, expectedName] of expectedPaths) {
    if (dirname(path) !== parent || !expectedName.test(basename(path))) {
      throw new Error(`Unsafe stale install journal path: ${path}`);
    }
  }
  try {
    process.kill(journal.pid, 0);
    throw new Error(
      `Another Doolittle installation is already running: ${lock}`,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
  const backupDetails = lstatOrNull(journal.backup, fileSystem);
  const destinationDetails = lstatOrNull(journal.destination, fileSystem);
  if (backupDetails?.isSymbolicLink()) {
    throw new Error(
      `Stale backup must not be a symbolic link: ${journal.backup}`,
    );
  }
  if (destinationDetails?.isSymbolicLink()) {
    throw new Error(
      `Stale destination must not be a symbolic link: ${journal.destination}`,
    );
  }
  if (backupDetails && destinationDetails) {
    assertSafeAbsentPath(journal.failure, "stale failure", fileSystem);
    fileSystem.renameSync(journal.destination, journal.failure);
    fileSystem.renameSync(journal.backup, journal.destination);
  } else if (backupDetails && !destinationDetails) {
    fileSystem.renameSync(journal.backup, journal.destination);
  } else if (
    !backupDetails &&
    destinationDetails &&
    (journal.phase === "promoting" || journal.phase === "promoted")
  ) {
    assertSafeAbsentPath(journal.failure, "stale failure", fileSystem);
    fileSystem.renameSync(journal.destination, journal.failure);
  }
  if (lstatOrNull(journal.stage, fileSystem)) {
    assertNoSymlink(journal.stage, "stale stage", fileSystem);
    fileSystem.rmSync(journal.stage, { recursive: true, force: true });
  }
  fileSystem.rmSync(lock, { recursive: true, force: true });
}

function assertNoSymlink(
  path: string,
  role: string,
  fileSystem: FileSystem,
): void {
  if (lstatOrNull(path, fileSystem)?.isSymbolicLink()) {
    throw new Error(`${role} must not be a symbolic link: ${path}`);
  }
}

/** Transactionally replaces a local app. Release mode requires Developer ID, notarization, and Gatekeeper. */
export function installMacOSApp(
  options: MacOSInstallOptions = {},
): MacOSInstallResult {
  const fileSystem = options.fileSystem ?? nodeFileSystem;
  const paths = resolveInstallPaths(
    options.source ?? resolve(desktopRoot, "release/mac-arm64/Doolittle.app"),
    options.destination ?? "/Applications/Doolittle.app",
    fileSystem,
  );
  const stage = uniqueSiblingPath(paths.destinationParent, "stage");
  const backup = uniqueSiblingPath(paths.destinationParent, "backup");
  const failure = uniqueSiblingPath(paths.destinationParent, "failure");
  const lock = lockPath(paths.destinationParent);
  const verifyPackage = options.verifyPackage ?? defaultVerifyPackage;
  const verifyTrust = options.verifyTrust ?? defaultVerifyTrust;
  const readMetadata = options.readMetadata ?? defaultReadMetadata;
  const trustMode: MacOSInstallTrustMode = options.allowAdHoc
    ? "ad-hoc"
    : "release";
  let destinationMoved = false;
  let stagePromoted = false;
  let failurePreserved = false;
  let preserveRecoveryJournal = false;

  assertSafeAbsentPath(stage, "stage", fileSystem);
  assertSafeAbsentPath(backup, "backup", fileSystem);
  assertSafeAbsentPath(failure, "failure", fileSystem);
  if (lstatOrNull(lock, fileSystem))
    recoverInterruptedMacOSInstall(lock, fileSystem);
  fileSystem.mkdirSync(lock);
  const journal: InstallJournal = {
    backup,
    destination: paths.destination,
    failure,
    phase: "staging",
    pid: process.pid,
    source: paths.source,
    stage,
  };
  writeJournal(lock, journal, fileSystem);
  try {
    if (fileSystem.existsSync(paths.destination))
      inspectMacOSAppIdentity(paths.destination, fileSystem, readMetadata);
    const sourceIdentity = inspectMacOSAppIdentity(
      paths.source,
      fileSystem,
      readMetadata,
    );
    verifyPackage(paths.source);
    verifyTrust(paths.source, trustMode);
    if (process.platform === "darwin" && !options.fileSystem) {
      copyMacOSApp(paths.source, stage);
    } else {
      fileSystem.cpSync(paths.source, stage, {
        recursive: true,
        force: false,
        errorOnExist: true,
      });
    }
    assertSafeAppBundle(stage, "stage", fileSystem, true);
    verifyPackage(stage);
    assertMatchingIdentity(
      sourceIdentity,
      inspectMacOSAppIdentity(stage, fileSystem, readMetadata),
      "staged",
    );
    verifyTrust(stage, trustMode);
    (options.quiesce ?? defaultQuiesce)(paths.destination);
    if (fileSystem.existsSync(paths.destination)) {
      journal.phase = "backup";
      writeJournal(lock, journal, fileSystem);
      fileSystem.renameSync(paths.destination, backup);
      destinationMoved = true;
      assertSafeAppBundle(backup, "backup", fileSystem, true);
    }
    journal.phase = "promoting";
    writeJournal(lock, journal, fileSystem);
    fileSystem.renameSync(stage, paths.destination);
    stagePromoted = true;
    journal.phase = "promoted";
    writeJournal(lock, journal, fileSystem);
    assertSafeAppBundle(paths.destination, "destination", fileSystem, true);
    verifyPackage(paths.destination);
    assertMatchingIdentity(
      sourceIdentity,
      inspectMacOSAppIdentity(paths.destination, fileSystem, readMetadata),
      "promoted",
    );
    verifyTrust(paths.destination, trustMode);
  } catch (error) {
    const rollbackErrors: unknown[] = [];
    if (stagePromoted && fileSystem.existsSync(paths.destination)) {
      try {
        assertNoSymlink(paths.destination, "promoted destination", fileSystem);
        fileSystem.renameSync(paths.destination, failure);
        failurePreserved = true;
      } catch (preserveError) {
        rollbackErrors.push(preserveError);
      }
    }
    if (destinationMoved && fileSystem.existsSync(backup)) {
      try {
        assertNoSymlink(backup, "backup", fileSystem);
        fileSystem.renameSync(backup, paths.destination);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (!stagePromoted && fileSystem.existsSync(stage)) {
      try {
        assertNoSymlink(stage, "stage", fileSystem);
        fileSystem.rmSync(stage, { recursive: true, force: true });
      } catch (stageCleanupError) {
        rollbackErrors.push(stageCleanupError);
      }
    }
    if (rollbackErrors.length > 0) {
      preserveRecoveryJournal = true;
      throw new AggregateError(
        [error, ...rollbackErrors],
        `Doolittle installation failed. Preserved paths: destination=${paths.destination}, backup=${backup}, failure=${failurePreserved ? failure : "not created"}, stage=${stage}.`,
      );
    }
    if (failurePreserved) {
      throw new Error(
        `Doolittle installation failed after promotion; the failed app was preserved at ${failure}.`,
        { cause: error },
      );
    }
    throw error;
  } finally {
    if (!preserveRecoveryJournal && lstatOrNull(lock, fileSystem))
      fileSystem.rmSync(lock, { recursive: true, force: true });
  }
  if (destinationMoved && fileSystem.existsSync(backup)) {
    try {
      assertNoSymlink(backup, "backup", fileSystem);
      fileSystem.rmSync(backup, { recursive: true, force: true });
    } catch (error) {
      throw new Error(
        `Doolittle was installed, but the retained backup could not be removed: ${backup}`,
        { cause: error },
      );
    }
  }
  return { ...paths, signatureVerified: true, trustMode };
}

function argumentValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--"))
    throw new Error(`${name} requires a path.`);
  return value;
}

function main(): void {
  if (process.platform !== "darwin")
    throw new Error("desktop:install:mac is supported only on macOS.");
  const args = process.argv.slice(2);
  const result = installMacOSApp({
    allowAdHoc: args.includes("--allow-ad-hoc"),
    source: argumentValue(args, "--source"),
    destination: argumentValue(args, "--destination"),
  });
  console.log(
    `Installed ${result.trustMode} verified Doolittle.app from ${result.source} to ${result.destination}.`,
  );
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) main();

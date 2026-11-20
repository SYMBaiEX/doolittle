import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const sparkleArchiveHash =
  "1a856d2a9edb8e628de88121d7be04cf0e2167f8641650b78fca00b14244cf27";
const teamId = "3VZKJ253J2";
export const releaseBundleId = "ai.doolittle.desktop";

interface ReleaseConfig {
  archive: Buffer;
  identity: string;
  notaryProfile: string;
  feed: string;
  publicKey: string;
}

export function releaseConfig(env: NodeJS.ProcessEnv): ReleaseConfig {
  const required = (name: string): string => {
    const value = env[name];
    if (!value?.trim()) {
      throw new Error(`${name} is required for a native macOS release.`);
    }
    return value;
  };
  const identity = required("DOOLITTLE_MAC_SIGN_IDENTITY");
  if (
    !/^[a-f0-9]{40}$/iu.test(identity) &&
    !(
      identity.startsWith("Developer ID Application: ") &&
      identity.endsWith(`(${teamId})`)
    )
  ) {
    throw new Error(
      "The native release requires a Doolittle Developer ID Application certificate.",
    );
  }
  const notaryProfile = required("DOOLITTLE_MAC_NOTARY_PROFILE");
  const feed = required("DOOLITTLE_MAC_UPDATE_FEED");
  const publicKey = required("DOOLITTLE_MAC_UPDATE_PUBLIC_KEY");
  const url = URL.parse(feed);
  if (
    !feed.startsWith("https://") ||
    feed !== feed.trim() ||
    /[\r\n\t]/u.test(feed) ||
    url?.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    feed.includes("#")
  ) {
    throw new Error(
      "The update feed must be an HTTPS URL without credentials or a fragment.",
    );
  }
  const decoded = Buffer.from(publicKey, "base64");
  if (decoded.length !== 32 || decoded.toString("base64") !== publicKey) {
    throw new Error(
      "The update public key must be a canonical Base64 Ed25519 public key.",
    );
  }
  const archive = readFileSync(resolve(required("DOOLITTLE_SPARKLE_ARCHIVE")));
  const digest = createHash("sha256").update(archive).digest("hex");
  if (digest !== sparkleArchiveHash) {
    throw new Error(
      "The Sparkle archive does not match the pinned 2.10.1 release checksum.",
    );
  }
  return { archive, identity, notaryProfile, feed, publicKey };
}

function xml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function releasePlist(config: ReleaseConfig): string {
  return `
  <key>SUFeedURL</key><string>${xml(config.feed)}</string>
  <key>SUPublicEDKey</key><string>${config.publicKey}</string>
  <key>SUVerifyUpdateBeforeExtraction</key><true/>
  <key>SURequireSignedFeed</key><true/>
  <key>SUSignedFeedFailureExpirationInterval</key><integer>0</integer>
  <key>SUEnableAutomaticChecks</key><false/>
  <key>SUAllowsAutomaticUpdates</key><false/>
  <key>SUAutomaticallyUpdate</key><false/>
  <key>SUEnableSystemProfiling</key><false/>`;
}

export function signReleaseBundle(
  config: ReleaseConfig,
  app: string,
  nodeEntitlements: string,
): void {
  const scratch = mkdtempSync(join(tmpdir(), "doolittle-sparkle-"));
  const resources = join(app, "Contents/Resources");
  const framework = join(app, "Contents/Frameworks/Sparkle.framework");
  try {
    execFileSync(
      "/usr/bin/tar",
      ["-xJf", "-", "-C", scratch, "./Sparkle.framework", "./LICENSE"],
      { input: config.archive, stdio: ["pipe", "inherit", "inherit"] },
    );
    run("/usr/bin/ditto", [join(scratch, "Sparkle.framework"), framework]);
    run("/usr/bin/ditto", [
      join(scratch, "LICENSE"),
      join(resources, "licenses/Sparkle.txt"),
    ]);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }

  const sign = (path: string, options: string[] = []): void => {
    run("/usr/bin/codesign", [
      "--force",
      "--options",
      "runtime",
      "--timestamp",
      "--sign",
      config.identity,
      ...options,
      path,
    ]);
  };

  const version = join(framework, "Versions/Current");
  for (const helper of [
    "Autoupdate",
    "Updater.app",
    "XPCServices/Installer.xpc",
  ]) {
    sign(join(version, helper));
  }
  sign(join(version, "XPCServices/Downloader.xpc"), [
    "--preserve-metadata=entitlements",
  ]);
  sign(framework);

  const node = join(resources, "runtime/bin/node");
  sign(node, ["--entitlements", nodeEntitlements]);
  for (const path of nativeExecutables(join(resources, "runtime"))) {
    if (path !== node) {
      sign(path);
    }
  }
  sign(join(app, "Contents/MacOS/doolittle-native"));
  sign(app);

  const requirement =
    `=anchor apple generic and identifier "${releaseBundleId}"` +
    " and certificate 1[field.1.2.840.113635.100.6.2.6] exists" +
    " and certificate leaf[field.1.2.840.113635.100.6.1.13] exists" +
    ` and certificate leaf[subject.OU] = "${teamId}"`;
  run("/usr/bin/codesign", ["--verify", "--strict", "-R", requirement, app]);
  run("/usr/bin/codesign", ["--verify", "--deep", "--strict", app]);
}

function* nativeExecutables(root: string): Generator<string> {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      yield* nativeExecutables(path);
    } else if (entry.isFile() && hasMachOHeader(path)) {
      yield path;
    }
  }
}

const machOMagic = new Set([
  0xfeedface, 0xcefaedfe, 0xfeedfacf, 0xcffaedfe, 0xcafebabe, 0xbebafeca,
  0xcafebabf, 0xbfbafeca,
]);

function hasMachOHeader(path: string): boolean {
  const descriptor = openSync(path, "r");
  const header = Buffer.alloc(4);
  try {
    if (readSync(descriptor, header, 0, header.length, 0) !== header.length) {
      return false;
    }
  } finally {
    closeSync(descriptor);
  }
  // A Java class shares the universal Mach-O magic. Ask file to disambiguate.
  return (
    machOMagic.has(header.readUInt32BE()) &&
    execFileSync("/usr/bin/file", ["--brief", path], {
      encoding: "utf8",
    }).startsWith("Mach-O")
  );
}

export function notarizeRelease(
  config: ReleaseConfig,
  app: string,
  archive: string,
): void {
  const submission = `${archive}.submission.zip`;
  const packaged = `${archive}.stapled.zip`;
  const zip = (destination: string): void =>
    run("/usr/bin/ditto", [
      "-c",
      "-k",
      "--sequesterRsrc",
      "--keepParent",
      app,
      destination,
    ]);
  try {
    zip(submission);
    const result = JSON.parse(
      execFileSync(
        "/usr/bin/xcrun",
        [
          "notarytool",
          "submit",
          submission,
          "--keychain-profile",
          config.notaryProfile,
          "--wait",
          "--output-format",
          "json",
        ],
        { encoding: "utf8" },
      ),
    ) as { status?: string; id?: string };
    if (result.status !== "Accepted") {
      throw new Error(
        `Apple did not accept notarization (submission ${result.id ?? "unknown"}).`,
      );
    }
    run("/usr/bin/xcrun", ["stapler", "staple", app]);
    run("/usr/bin/xcrun", ["stapler", "validate", app]);
    run("/usr/sbin/spctl", ["--assess", "--type", "execute", app]);
    zip(packaged);
    renameSync(packaged, archive);
  } finally {
    rmSync(submission, { force: true });
    rmSync(packaged, { force: true });
  }
}

function run(command: string, args: string[]): void {
  execFileSync(command, args, { stdio: "inherit" });
}

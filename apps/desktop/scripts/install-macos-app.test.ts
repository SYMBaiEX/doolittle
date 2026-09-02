import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  installMacOSApp,
  recoverInterruptedMacOSInstall,
} from "./install-macos-app";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function appPlist(identifier = "ai.doolittle.desktop"): string {
  return `<?xml version="1.0"?><plist><dict><key>CFBundleIdentifier</key><string>${identifier}</string><key>CFBundleExecutable</key><string>Doolittle</string><key>CFBundleVersion</key><string>0.1.0</string></dict></plist>`;
}

function writeApp(path: string, contents: string, identifier?: string): void {
  mkdirSync(resolve(path, "Contents/Resources/runtime/bin"), {
    recursive: true,
  });
  mkdirSync(resolve(path, "Contents/MacOS"), { recursive: true });
  writeFileSync(resolve(path, "Contents/Info.plist"), appPlist(identifier));
  writeFileSync(resolve(path, "Contents/MacOS/Doolittle"), "executable");
  writeFileSync(resolve(path, "Contents/Resources/app.asar"), contents);
  writeFileSync(
    resolve(path, "Contents/Resources/runtime/bin/runtime-manifest.json"),
    JSON.stringify({ contents }),
  );
}

function fixture(options: { destination?: boolean; identifier?: string } = {}) {
  const root = mkdtempSync(resolve(tmpdir(), "doolittle-macos-install-"));
  directories.push(root);
  const source = resolve(root, "release/mac-arm64/Doolittle.app");
  const destination = resolve(root, "Applications/Doolittle.app");
  writeApp(source, "new", options.identifier);
  mkdirSync(dirname(destination), { recursive: true });
  if (options.destination !== false) writeApp(destination, "old");
  return { destination, root, source };
}

const localTrust = () => undefined;
const verified = () => undefined;
const fixtureMetadata = (appBundlePath: string) => {
  const info = readFileSync(
    resolve(appBundlePath, "Contents/Info.plist"),
    "utf8",
  );
  const value = (key: string) =>
    info.match(
      new RegExp(`<key>${key}</key><string>([^<]+)</string>`, "u"),
    )?.[1] ?? "";
  return {
    executable: value("CFBundleExecutable"),
    identifier: value("CFBundleIdentifier"),
    shortVersion: "0.1.0",
    version: value("CFBundleVersion"),
  };
};

describe("installMacOSApp", () => {
  it("installs a fresh verified ad-hoc app", () => {
    const { destination, source } = fixture({ destination: false });
    const result = installMacOSApp({
      allowAdHoc: true,
      destination,
      source,
      verifyPackage: verified,
      verifyTrust: localTrust,
      readMetadata: fixtureMetadata,
    });
    expect(result.trustMode).toBe("ad-hoc");
    expect(
      readFileSync(resolve(destination, "Contents/Resources/app.asar"), "utf8"),
    ).toBe("new");
  });

  it("normalizes ad-hoc trust on the staged copy before verification", () => {
    const { destination, source } = fixture({ destination: false });
    const prepared: string[] = [];
    const verifiedTrust: string[] = [];
    installMacOSApp({
      allowAdHoc: true,
      destination,
      source,
      prepareTrust: (path, mode) => prepared.push(`${mode}:${path}`),
      readMetadata: fixtureMetadata,
      verifyPackage: verified,
      verifyTrust: (path, mode) => verifiedTrust.push(`${mode}:${path}`),
    });
    expect(prepared).toHaveLength(1);
    expect(prepared[0]).toMatch(/^ad-hoc:.*\.Doolittle\.stage-/u);
    expect(verifiedTrust).toHaveLength(2);
    expect(verifiedTrust[0]).toMatch(/^ad-hoc:.*\.Doolittle\.stage-/u);
    expect(verifiedTrust[1]).toBe(`ad-hoc:${realpathSync(destination)}`);
  });

  it("replaces only after verifying source, stage, and promoted app", () => {
    const { destination, source } = fixture();
    const verifiedPaths: string[] = [];
    installMacOSApp({
      allowAdHoc: true,
      destination,
      source,
      verifyPackage: (path) => verifiedPaths.push(path),
      verifyTrust: localTrust,
      readMetadata: fixtureMetadata,
    });
    expect(verifiedPaths).toHaveLength(3);
    expect(verifiedPaths[0]).toBe(realpathSync(source));
    expect(verifiedPaths[2]).toBe(realpathSync(destination));
    expect(
      readFileSync(resolve(destination, "Contents/Resources/app.asar"), "utf8"),
    ).toBe("new");
  });

  it("does not touch the destination when staged verification fails", () => {
    const { destination, source } = fixture();
    expect(() =>
      installMacOSApp({
        allowAdHoc: true,
        destination,
        source,
        verifyPackage: (path) => {
          if (path !== realpathSync(source))
            throw new Error("fixture verification failed");
        },
        verifyTrust: localTrust,
        readMetadata: fixtureMetadata,
      }),
    ).toThrow("fixture verification failed");
    expect(
      readFileSync(resolve(destination, "Contents/Resources/app.asar"), "utf8"),
    ).toBe("old");
  });

  it("restores the previous app when the second promotion rename fails", () => {
    const { destination, source } = fixture();
    let renameCount = 0;
    expect(() =>
      installMacOSApp({
        allowAdHoc: true,
        destination,
        source,
        verifyPackage: verified,
        verifyTrust: localTrust,
        readMetadata: fixtureMetadata,
        fileSystem: {
          cpSync,
          existsSync,
          lstatSync,
          mkdirSync,
          readFileSync,
          realpathSync,
          renameSync: (from, to) => {
            renameCount += 1;
            if (renameCount === 2) throw new Error("promotion rename failed");
            renameSync(from, to);
          },
          rmSync,
          statSync,
          writeFileSync,
        },
      }),
    ).toThrow("promotion rename failed");
    expect(
      readFileSync(resolve(destination, "Contents/Resources/app.asar"), "utf8"),
    ).toBe("old");
  });

  it("preserves the failed promoted app and restores the prior app after post-promotion verification fails", () => {
    const { destination, root, source } = fixture();
    let verifyCount = 0;
    expect(() =>
      installMacOSApp({
        allowAdHoc: true,
        destination,
        source,
        verifyPackage: () => {
          verifyCount += 1;
          if (verifyCount === 3)
            throw new Error("promoted verification failed");
        },
        verifyTrust: localTrust,
        readMetadata: fixtureMetadata,
      }),
    ).toThrow("failed after promotion");
    expect(
      readFileSync(resolve(destination, "Contents/Resources/app.asar"), "utf8"),
    ).toBe("old");
    expect(
      readdirSync(dirname(destination)).some((name) =>
        name.startsWith(".Doolittle.failure-"),
      ),
    ).toBe(true);
    expect(root).toBeTruthy();
  });

  it("rejects an unexpected bundle identifier before mutation", () => {
    const { destination, source } = fixture({
      identifier: "com.example.wrong",
    });
    expect(() =>
      installMacOSApp({
        allowAdHoc: true,
        destination,
        source,
        verifyPackage: verified,
        verifyTrust: localTrust,
        readMetadata: fixtureMetadata,
      }),
    ).toThrow("Unexpected macOS bundle identifier");
  });

  it("rejects symlink sources and concurrent locks", () => {
    const first = fixture();
    const link = resolve(first.root, "linked/Doolittle.app");
    mkdirSync(dirname(link), { recursive: true });
    symlinkSync(first.source, link);
    expect(() =>
      installMacOSApp({
        allowAdHoc: true,
        destination: first.destination,
        source: link,
        verifyPackage: verified,
        verifyTrust: localTrust,
        readMetadata: fixtureMetadata,
      }),
    ).toThrow("symbolic link");
    mkdirSync(resolve(dirname(first.destination), ".Doolittle.install.lock"));
    expect(() =>
      installMacOSApp({
        allowAdHoc: true,
        destination: first.destination,
        source: first.source,
        verifyPackage: verified,
        verifyTrust: localTrust,
      }),
    ).toThrow("already running");
  });

  it("rejects alternate app names and dangling destination symlinks", () => {
    const first = fixture({ destination: false });
    const alternate = resolve(first.root, "Applications/Other.app");
    expect(() =>
      installMacOSApp({
        allowAdHoc: true,
        destination: alternate,
        source: first.source,
        readMetadata: fixtureMetadata,
        verifyPackage: verified,
        verifyTrust: localTrust,
      }),
    ).toThrow("destination must be an app bundle");

    symlinkSync(resolve(first.root, "missing-app"), first.destination);
    expect(() =>
      installMacOSApp({
        allowAdHoc: true,
        destination: first.destination,
        source: first.source,
        readMetadata: fixtureMetadata,
        verifyPackage: verified,
        verifyTrust: localTrust,
      }),
    ).toThrow("symbolic link");
  });

  it("quiesces before mutating the installed app", () => {
    const { destination, source } = fixture();
    expect(() =>
      installMacOSApp({
        allowAdHoc: true,
        destination,
        source,
        quiesce: () => {
          throw new Error("app is still running");
        },
        readMetadata: fixtureMetadata,
        verifyPackage: verified,
        verifyTrust: localTrust,
      }),
    ).toThrow("app is still running");
    expect(
      readFileSync(resolve(destination, "Contents/Resources/app.asar"), "utf8"),
    ).toBe("old");
  });

  it("requires an explicit ad-hoc opt-in instead of accepting a release fallback", () => {
    const { destination, source } = fixture();
    const trustModes: string[] = [];
    expect(() =>
      installMacOSApp({
        destination,
        source,
        verifyPackage: verified,
        readMetadata: fixtureMetadata,
        verifyTrust: (_path, mode) => {
          trustModes.push(mode);
          if (mode === "release") throw new Error("not notarized");
        },
      }),
    ).toThrow("not notarized");
    expect(trustModes).toEqual(["release"]);
  });

  it("recovers a stale bounded journal by restoring its backup", () => {
    const { destination, source } = fixture();
    const parent = dirname(destination);
    const backup = resolve(parent, ".Doolittle.backup-stale.app");
    const stage = resolve(parent, ".Doolittle.stage-stale.app");
    const failure = resolve(parent, ".Doolittle.failure-stale.app");
    const lock = resolve(parent, ".Doolittle.install.lock");
    renameSync(destination, backup);
    mkdirSync(lock);
    writeFileSync(
      resolve(lock, "journal.json"),
      JSON.stringify({
        backup,
        destination,
        failure,
        phase: "promoted",
        pid: 999_999_999,
        source,
        stage,
      }),
    );
    recoverInterruptedMacOSInstall(lock);
    expect(
      readFileSync(resolve(destination, "Contents/Resources/app.asar"), "utf8"),
    ).toBe("old");
    expect(existsSync(lock)).toBe(false);
  });

  it("preserves an interrupted promoted app and restores its backup", () => {
    const { destination, source } = fixture();
    const parent = dirname(destination);
    const backup = resolve(parent, ".Doolittle.backup-stale.app");
    const stage = resolve(parent, ".Doolittle.stage-stale.app");
    const failure = resolve(parent, ".Doolittle.failure-stale.app");
    const lock = resolve(parent, ".Doolittle.install.lock");
    renameSync(destination, backup);
    writeApp(destination, "unverified-promoted");
    mkdirSync(lock);
    writeFileSync(
      resolve(lock, "journal.json"),
      JSON.stringify({
        backup,
        destination,
        failure,
        phase: "promoted",
        pid: 999_999_999,
        source,
        stage,
      }),
    );

    recoverInterruptedMacOSInstall(lock);

    expect(
      readFileSync(resolve(destination, "Contents/Resources/app.asar"), "utf8"),
    ).toBe("old");
    expect(
      readFileSync(resolve(failure, "Contents/Resources/app.asar"), "utf8"),
    ).toBe("unverified-promoted");
    expect(existsSync(lock)).toBe(false);
  });

  it("preserves an interrupted fresh promotion without trusting it", () => {
    const { destination, source } = fixture({ destination: false });
    const parent = dirname(destination);
    const backup = resolve(parent, ".Doolittle.backup-stale.app");
    const stage = resolve(parent, ".Doolittle.stage-stale.app");
    const failure = resolve(parent, ".Doolittle.failure-stale.app");
    const lock = resolve(parent, ".Doolittle.install.lock");
    writeApp(destination, "unverified-promoted");
    mkdirSync(lock);
    writeFileSync(
      resolve(lock, "journal.json"),
      JSON.stringify({
        backup,
        destination,
        failure,
        phase: "promoted",
        pid: 999_999_999,
        source,
        stage,
      }),
    );

    recoverInterruptedMacOSInstall(lock);

    expect(existsSync(destination)).toBe(false);
    expect(
      readFileSync(resolve(failure, "Contents/Resources/app.asar"), "utf8"),
    ).toBe("unverified-promoted");
    expect(existsSync(lock)).toBe(false);
  });
});

import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  validateRuntimeDependencySecurityPolicy,
  validateRuntimeManifest,
  verifyMacCodeSignature,
  verifyMacRuntimeNativeCodeTeam,
  verifyPackagedNativeRuntime,
} from "./verify-package";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function stagedAppAsarPath(): { appAsarPath: string; runtimeBin: string } {
  const directory = mkdtempSync(resolve(tmpdir(), "doolittle-package-"));
  temporaryDirectories.push(directory);
  const resources = resolve(directory, "Contents", "Resources");
  const runtimeBin = resolve(resources, "runtime", "bin");
  mkdirSync(runtimeBin, { recursive: true });
  const appAsarPath = resolve(resources, "app.asar");
  writeFileSync(appAsarPath, "fixture", "utf8");
  return { appAsarPath, runtimeBin };
}

function stagePackagedNativeRuntime(
  packageMetadata: Record<string, { name: string; version: string }> = {},
): { appAsarPath: string; manifest: ReturnType<typeof validRuntimeManifest> } {
  const { appAsarPath, runtimeBin } = stagedAppAsarPath();
  const manifest = validRuntimeManifest();
  writeFileSync(resolve(runtimeBin, manifest.entry), "export {};", "utf8");
  writeFileSync(resolve(runtimeBin, manifest.acpEntry), "export {};", "utf8");
  writeFileSync(resolve(runtimeBin, manifest.assets[0]), "fixture", "utf8");
  for (const dependency of manifest.nativePackageClosure) {
    const metadata = packageMetadata[dependency.name] ?? dependency;
    const packageDirectory = resolve(
      runtimeBin,
      "node_modules",
      ...dependency.name.split("/"),
    );
    mkdirSync(packageDirectory, { recursive: true });
    writeFileSync(
      resolve(packageDirectory, "package.json"),
      JSON.stringify({ ...metadata, main: "index.js" }),
      "utf8",
    );
    writeFileSync(
      resolve(packageDirectory, "index.js"),
      "module.exports = {};",
      "utf8",
    );
  }
  const notices = [
    ...manifest.bundledPackages,
    ...manifest.nativePackageClosure,
  ]
    .map((dependency) =>
      [
        `Package: ${dependency.name}`,
        `Version: ${dependency.version}`,
        "Declared license: MIT",
        "License file: LICENSE",
        "MIT License text",
      ].join("\n"),
    )
    .join("\n\n");
  writeFileSync(resolve(runtimeBin, manifest.thirdPartyNotices.file), notices);
  manifest.thirdPartyNotices.sha256 = createHash("sha256")
    .update(notices)
    .digest("hex");
  writeFileSync(
    resolve(runtimeBin, "runtime-manifest.json"),
    JSON.stringify(manifest),
    "utf8",
  );
  return { appAsarPath, manifest };
}

const validRuntimeManifest = () => ({
  schema: 1 as const,
  runtime: "node",
  node: "electron-embedded",
  entry: "doolittle-runtime.mjs",
  acpEntry: "doolittle-acp.mjs",
  assets: ["pglite.wasm"],
  nativeEntryPackages: ["@native/entry"],
  nativePackages: ["@native/entry", "native-dependency"],
  bundledPackages: [{ name: "@doolittle/agent", version: "0.1.0" }],
  nativeExternalPackages: [{ name: "@native/entry", version: "1.0.0" }],
  nativePackageClosure: [
    { name: "@native/entry", version: "1.0.0" },
    { name: "native-dependency", version: "1.0.0" },
  ],
  thirdPartyNotices: {
    file: "THIRD-PARTY-NOTICES.txt",
    packages: [
      { name: "@doolittle/agent", version: "0.1.0" },
      { name: "@native/entry", version: "1.0.0" },
      { name: "native-dependency", version: "1.0.0" },
    ],
    sha256: "0".repeat(64),
  },
});

describe("packaged runtime dependency inventory", () => {
  it("accepts a complete deterministic runtime manifest", () => {
    expect(() => validateRuntimeManifest(validRuntimeManifest())).not.toThrow();
  });

  it("rejects a missing or tampered dependency inventory", () => {
    const missing = validRuntimeManifest();
    // @ts-expect-error Test the untrusted JSON boundary.
    delete missing.bundledPackages;
    expect(() => validateRuntimeManifest(missing)).toThrow(
      "invalid bundled dependency inventory",
    );

    const tampered = validRuntimeManifest();
    tampered.nativePackageClosure = [
      { name: "another-package", version: "1.0.0" },
    ];
    expect(() => validateRuntimeManifest(tampered)).toThrow(
      "does not match copied packages",
    );
  });

  it("rejects missing third-party notices metadata", () => {
    const manifest = validRuntimeManifest();
    // @ts-expect-error Test the untrusted JSON boundary.
    delete manifest.thirdPartyNotices;
    expect(() => validateRuntimeManifest(manifest)).toThrow(
      "invalid third-party notices",
    );
  });

  it("rejects duplicate or unsorted package records", () => {
    const manifest = validRuntimeManifest();
    manifest.bundledPackages = [
      { name: "zeta", version: "1.0.0" },
      { name: "alpha", version: "1.0.0" },
    ];
    expect(() => validateRuntimeManifest(manifest)).toThrow(
      "invalid bundled dependency inventory",
    );
  });

  it("accepts the reviewed patched dependency lines", () => {
    const manifest = validRuntimeManifest();
    manifest.bundledPackages = [
      { name: "axios", version: "1.19.0" },
      { name: "lodash", version: "4.18.1" },
      { name: "undici", version: "6.28.0" },
      { name: "undici", version: "8.10.0" },
      { name: "ws", version: "8.21.3" },
    ];
    expect(() =>
      validateRuntimeDependencySecurityPolicy(manifest),
    ).not.toThrow();
  });

  it("rejects reviewed high-severity dependency ranges", () => {
    for (const dependency of [
      { name: "extract-zip", version: "2.0.1" },
      { name: "undici", version: "8.5.0" },
      { name: "ws", version: "8.20.0" },
      { name: "sharp", version: "0.34.5" },
    ]) {
      const manifest = validRuntimeManifest();
      manifest.bundledPackages = [dependency];
      expect(() => validateRuntimeManifest(manifest)).toThrow(
        "blocked high-severity dependency versions",
      );
    }
  });

  it("fails closed on an unreviewed version for a guarded package", () => {
    const manifest = validRuntimeManifest();
    manifest.bundledPackages = [{ name: "undici", version: "workspace:*" }];
    expect(() => validateRuntimeManifest(manifest)).toThrow(
      "blocked high-severity dependency versions",
    );
  });

  it("requires the runtime manifest from a staged package", () => {
    const { appAsarPath } = stagedAppAsarPath();
    expect(() => verifyPackagedNativeRuntime(appAsarPath)).toThrow(
      "runtime manifest is missing",
    );
  });

  it("rejects a tampered runtime manifest before loading its native packages", () => {
    const { appAsarPath, runtimeBin } = stagedAppAsarPath();
    const manifest = validRuntimeManifest();
    manifest.nativePackageClosure = [];
    writeFileSync(
      resolve(runtimeBin, "runtime-manifest.json"),
      JSON.stringify(manifest),
      "utf8",
    );
    expect(() => verifyPackagedNativeRuntime(appAsarPath)).toThrow(
      "does not match copied packages",
    );
  });

  it("accepts native packages whose packaged metadata matches the manifest", () => {
    const { appAsarPath, manifest } = stagePackagedNativeRuntime();
    expect(verifyPackagedNativeRuntime(appAsarPath)).toEqual(
      manifest.nativePackages,
    );
  });

  it("rejects omitted or tampered packaged third-party notices", () => {
    const { appAsarPath, manifest } = stagePackagedNativeRuntime();
    const noticesPath = resolve(
      dirname(appAsarPath),
      "runtime",
      "bin",
      manifest.thirdPartyNotices.file,
    );
    rmSync(noticesPath);
    expect(() => verifyPackagedNativeRuntime(appAsarPath)).toThrow(
      "third-party notices are missing",
    );

    const staged = stagePackagedNativeRuntime();
    writeFileSync(
      resolve(
        dirname(staged.appAsarPath),
        "runtime",
        "bin",
        staged.manifest.thirdPartyNotices.file,
      ),
      "tampered",
    );
    expect(() => verifyPackagedNativeRuntime(staged.appAsarPath)).toThrow(
      "third-party notices were tampered",
    );
  });

  it("rejects a native package whose packaged version differs from the manifest", () => {
    const { appAsarPath } = stagePackagedNativeRuntime({
      "native-dependency": { name: "native-dependency", version: "2.0.0" },
    });
    expect(() => verifyPackagedNativeRuntime(appAsarPath)).toThrow(
      "expected native-dependency@1.0.0, found native-dependency@2.0.0",
    );
  });

  it("rejects a native package whose packaged name differs from the manifest", () => {
    const { appAsarPath } = stagePackagedNativeRuntime({
      "native-dependency": { name: "renamed-dependency", version: "1.0.0" },
    });
    expect(() => verifyPackagedNativeRuntime(appAsarPath)).toThrow(
      "expected native-dependency@1.0.0, found renamed-dependency@1.0.0",
    );
  });
});

describe("macOS package signature verification", () => {
  it("runs strict codesign verification against the staged app bundle", () => {
    const run = vi.fn(() => 0);
    expect(() =>
      verifyMacCodeSignature("/staging/mac-arm64/Doolittle.app", run),
    ).not.toThrow();
    expect(run).toHaveBeenCalledWith("codesign", [
      "--verify",
      "--deep",
      "--strict",
      "--verbose=2",
      "/staging/mac-arm64/Doolittle.app",
    ]);
  });

  it("fails when codesign rejects the packaged application", () => {
    const run = vi.fn(() => 1);
    expect(() => verifyMacCodeSignature("/release/Doolittle.app", run)).toThrow(
      "macOS code signature verification failed",
    );
    expect(run).toHaveBeenCalledWith("codesign", [
      "--verify",
      "--deep",
      "--strict",
      "--verbose=2",
      "/release/Doolittle.app",
    ]);
  });
});

describe("macOS packaged runtime native-code signing", () => {
  const app = "/release/Doolittle.app";
  const nativeCode = [
    `${app}/Contents/Resources/runtime/bin/node_modules/native/pty.node`,
    `${app}/Contents/Resources/runtime/bin/node_modules/native/spawn-helper`,
  ];

  it("accepts runtime native code signed by the application team", () => {
    const inspect = vi.fn(() => ({
      status: 0,
      output: "TeamIdentifier=3VZKJ253J2",
    }));
    expect(() =>
      verifyMacRuntimeNativeCodeTeam(app, nativeCode, inspect),
    ).not.toThrow();
    expect(inspect).toHaveBeenCalledTimes(3);
  });

  it("rejects ad-hoc runtime native code without a team", () => {
    const inspect = vi.fn((path: string) => ({
      status: 0,
      output:
        path === app ? "TeamIdentifier=3VZKJ253J2" : "TeamIdentifier=not set",
    }));
    expect(() =>
      verifyMacRuntimeNativeCodeTeam(app, nativeCode, inspect),
    ).toThrow("has no TeamIdentifier");
  });

  it("rejects runtime native code signed by another team", () => {
    const inspect = vi.fn((path: string) => ({
      status: 0,
      output:
        path === app
          ? "TeamIdentifier=3VZKJ253J2"
          : "TeamIdentifier=FOREIGNTEAM",
    }));
    expect(() =>
      verifyMacRuntimeNativeCodeTeam(app, nativeCode, inspect),
    ).toThrow("TeamIdentifier mismatch");
  });
});

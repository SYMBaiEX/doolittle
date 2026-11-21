import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { installedDesktopProductionPackages } from "../../apps/desktop/scripts/desktop-artifact";
import {
  isInstalledPackageManifestPath,
  packageNamesFromAsarEntries,
} from "../../apps/desktop/scripts/package-composition";
import { verifyPackagedNativeRuntime } from "../../apps/desktop/scripts/verify-package";

it("fails package verification when a deferred runtime bundle is changed or missing", () => {
  const root = mkdtempSync(join(tmpdir(), "doolittle-runtime-bundle-"));
  try {
    const bin = join(root, "runtime", "bin");
    mkdirSync(bin, { recursive: true });
    const bundleSource = "export {};\n";
    const bundlePaths = [
      "chunk-tools.mjs",
      "doolittle-acp.mjs",
      "doolittle-runtime.mjs",
    ];
    const sha256 = (source: string) =>
      createHash("sha256").update(source).digest("hex");
    for (const file of bundlePaths)
      writeFileSync(join(bin, file), bundleSource);
    const packages = [{ name: "fixture-package", version: "1.0.0" }];
    const notices =
      "Package: fixture-package\nVersion: 1.0.0\nDeclared license: MIT\nLicense file: LICENSE\n";
    writeFileSync(join(bin, "THIRD-PARTY-NOTICES.txt"), notices);
    writeFileSync(
      join(bin, "runtime-manifest.json"),
      JSON.stringify({
        schema: 1,
        runtime: "node",
        node: "electron-embedded",
        entry: "doolittle-runtime.mjs",
        acpEntry: "doolittle-acp.mjs",
        bundles: bundlePaths.map((file) => ({
          file,
          sha256: sha256(bundleSource),
        })),
        assets: [],
        bundledPackages: packages,
        nativeEntryPackages: [],
        nativePackages: [],
        nativeExternalPackages: [],
        nativePackageClosure: [],
        thirdPartyNotices: {
          file: "THIRD-PARTY-NOTICES.txt",
          packages,
          sha256: sha256(notices),
        },
      }),
    );
    const asar = join(root, "app.asar");
    expect(verifyPackagedNativeRuntime(asar)).toEqual([]);
    const chunk = join(bin, bundlePaths[0]);
    writeFileSync(chunk, "/* changed */\n");
    expect(() => verifyPackagedNativeRuntime(asar)).toThrow(
      "Packaged runtime bundle was tampered with: chunk-tools.mjs",
    );
    rmSync(chunk);
    expect(() => verifyPackagedNativeRuntime(asar)).toThrow(
      "Packaged runtime bundle is missing or unsafe: chunk-tools.mjs",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("inventories package roots and nested dependencies rather than internal module settings", () => {
  const paths = [
    "/node_modules/@tanstack/react-query/package.json",
    "/node_modules/@tanstack/react-query/build/query-codemods/package.json",
    "/node_modules/client/package.json",
    "/node_modules/client/node_modules/@scope/dependency/package.json",
    "/node_modules/@scope/package.json",
  ];
  expect(paths.filter(isInstalledPackageManifestPath)).toEqual([
    paths[0],
    paths[2],
    paths[3],
  ]);
});

it("distinguishes scope directories from packages without hiding nested dependencies", () => {
  expect(
    packageNamesFromAsarEntries([
      "/node_modules/@tanstack",
      "/node_modules/@doolittle/",
      "/node_modules/@tanstack/query-core/package.json",
      "/node_modules/client/index.js",
      "/node_modules/client/node_modules/@unknown/package/index.js",
    ]),
  ).toEqual(["@tanstack/query-core", "@unknown/package", "client"]);
});

it("inventories dependencies whose public exports hide package manifests", () => {
  const root = mkdtempSync(join(tmpdir(), "doolittle-manifest-exports-"));
  try {
    const dependency = join(root, "node_modules/hidden-manifest");
    mkdirSync(join(dependency, "dist"), { recursive: true });
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        name: "client",
        version: "1.0.0",
        dependencies: { "hidden-manifest": "1.0.0" },
      }),
    );
    writeFileSync(
      join(dependency, "package.json"),
      JSON.stringify({
        name: "hidden-manifest",
        version: "1.0.0",
        exports: "./dist/index.cjs",
      }),
    );
    writeFileSync(join(dependency, "dist/index.cjs"), "module.exports = {};\n");
    expect(installedDesktopProductionPackages(root).inventory).toEqual([
      { name: "hidden-manifest", version: "1.0.0" },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertDesktopDistributionLicensePolicy,
  discoverDynamicCommonJsPackages,
  discoverRuntimeAssetReferences,
  emittedMetafileInputPaths,
  runtimePackageClosure,
  stableRuntimeDependencyInventory,
  writeRuntimeThirdPartyNotices,
} from "./runtime-requirements";

describe("packaged runtime CommonJS requirements", () => {
  it("keeps only metafile inputs that contribute emitted bytes", () => {
    expect(
      emittedMetafileInputPaths({
        outputs: {
          "runtime.mjs": {
            imports: [],
            exports: [],
            entryPoint: "src/index.ts",
            inputs: {
              "node_modules/kept/index.js": { bytesInOutput: 4 },
              "node_modules/tree-shaken/index.js": { bytesInOutput: 0 },
            },
            bytes: 4,
          },
          "service.cjs": {
            imports: [],
            exports: [],
            inputs: {
              "node_modules/kept/index.js": { bytesInOutput: 3 },
              "node_modules/service/index.js": { bytesInOutput: 2 },
            },
            bytes: 5,
          },
        },
      }),
    ).toEqual(["node_modules/kept/index.js", "node_modules/service/index.js"]);
  });

  it("deduplicates dynamic createRequire package names", () => {
    expect(
      discoverDynamicCommonJsPackages(
        [
          'createRequire(import.meta.url)("git-workspace-service")',
          'shim(import.meta.url)("git-workspace-service")',
          'createRequire(import.meta.url)("node-readable-to-web-readable-stream")',
        ].join("\n"),
      ),
    ).toEqual([
      "git-workspace-service",
      "node-readable-to-web-readable-stream",
    ]);
  });

  it("ignores static imports and unrelated strings", () => {
    expect(
      discoverDynamicCommonJsPackages(
        'import workspace from "git-workspace-service";',
      ),
    ).toEqual([]);
  });

  it("discovers and deduplicates local runtime assets", () => {
    expect(
      discoverRuntimeAssetReferences(
        [
          'new URL("./vector.tar.gz",import.meta.url)',
          "new URL('./pglite.wasm', import.meta.url)",
          'new URL("./pglite.data", import.meta.url)',
          'new URL("./vector.tar.gz", import.meta.url)',
        ].join("\n"),
      ),
    ).toEqual(["pglite.data", "pglite.wasm", "vector.tar.gz"]);
  });

  it("ignores remote and unrelated URL references", () => {
    expect(
      discoverRuntimeAssetReferences(
        [
          'new URL("https://example.com/pglite.wasm")',
          'new URL("./runtime.mjs", import.meta.url)',
          'new URL("../pglite.wasm", import.meta.url)',
        ].join("\n"),
      ),
    ).toEqual([]);
  });

  it("walks required and installed optional native package dependencies", () => {
    expect(
      runtimePackageClosure(
        ["@snazzah/davey"],
        new Map([
          [
            "@snazzah/davey",
            {
              dependencies: { "required-runtime": "1.0.0" },
              optionalDependencies: {
                "@snazzah/davey-darwin-arm64": "0.1.12",
              },
            },
          ],
          ["required-runtime", undefined],
          ["@snazzah/davey-darwin-arm64", undefined],
        ]),
      ),
    ).toEqual([
      "@snazzah/davey",
      "@snazzah/davey-darwin-arm64",
      "required-runtime",
    ]);
  });

  it("creates a sorted, deduplicated runtime dependency inventory", () => {
    expect(
      stableRuntimeDependencyInventory([
        { name: "zeta", version: "1.0.0" },
        { name: "alpha", version: "2.0.0" },
        { name: "zeta", version: "1.0.0" },
      ]),
    ).toEqual([
      { name: "alpha", version: "2.0.0" },
      { name: "zeta", version: "1.0.0" },
    ]);
  });

  it("retains distinct installed versions and rejects incomplete entries", () => {
    expect(
      stableRuntimeDependencyInventory([
        { name: "same", version: "2.0.0" },
        { name: "same", version: "1.0.0" },
      ]),
    ).toEqual([
      { name: "same", version: "1.0.0" },
      { name: "same", version: "2.0.0" },
    ]);
    expect(() =>
      stableRuntimeDependencyInventory([{ name: "", version: "1.0.0" }]),
    ).toThrow("require a name and version");
  });

  it("writes deterministic notices from only attributed runtime packages", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "doolittle-notices-"));
    try {
      const alpha = resolve(directory, "alpha");
      const beta = resolve(directory, "beta");
      const output = resolve(directory, "THIRD-PARTY-NOTICES.txt");
      for (const [packageDirectory, name, version, license] of [
        [alpha, "alpha", "1.0.0", "MIT"],
        [beta, "beta", "2.0.0", "Apache-2.0"],
      ] as const) {
        mkdirSync(packageDirectory);
        writeFileSync(
          resolve(packageDirectory, "package.json"),
          JSON.stringify({ name, version, license }),
        );
        writeFileSync(resolve(packageDirectory, "LICENSE"), `${license} text`);
      }
      writeRuntimeThirdPartyNotices(
        output,
        [
          { name: "beta", version: "2.0.0" },
          { name: "alpha", version: "1.0.0" },
        ],
        [
          { name: "beta", version: "2.0.0", directory: beta },
          { name: "alpha", version: "1.0.0", directory: alpha },
        ],
      );
      expect(readFileSync(output, "utf8")).toContain(
        "Package: alpha\nVersion: 1.0.0\nDeclared license: MIT\nLicense file: LICENSE",
      );
      expect(
        readFileSync(output, "utf8").indexOf("Package: alpha"),
      ).toBeLessThan(readFileSync(output, "utf8").indexOf("Package: beta"));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("fails closed when a runtime package lacks readable legal attribution", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "doolittle-notices-"));
    try {
      writeFileSync(
        resolve(directory, "package.json"),
        JSON.stringify({ name: "missing-license", version: "1.0.0" }),
      );
      expect(() =>
        writeRuntimeThirdPartyNotices(
          resolve(directory, "THIRD-PARTY-NOTICES.txt"),
          [{ name: "missing-license", version: "1.0.0" }],
          [{ name: "missing-license", version: "1.0.0", directory }],
        ),
      ).toThrow("no license text file");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("uses the checked-in canonical GPL text for the reviewed AES package", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "doolittle-notices-"));
    try {
      writeFileSync(
        resolve(directory, "package.json"),
        JSON.stringify({
          name: "@cryptography/aes",
          version: "0.1.1",
          license: "GPL-3.0-or-later",
        }),
      );
      const output = resolve(directory, "THIRD-PARTY-NOTICES.txt");
      writeRuntimeThirdPartyNotices(
        output,
        [{ name: "@cryptography/aes", version: "0.1.1" }],
        [{ name: "@cryptography/aes", version: "0.1.1", directory }],
      );
      expect(readFileSync(output, "utf8")).toContain(
        "GPL-3.0.txt (checked-in canonical license text)",
      );
      expect(readFileSync(output, "utf8")).toContain(
        "GNU GENERAL PUBLIC LICENSE\n                       Version 3, 29 June 2007",
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("blocks strong-copyleft packages from the bundled desktop distribution", () => {
    const directory = mkdtempSync(
      resolve(tmpdir(), "doolittle-license-policy-"),
    );
    try {
      writeFileSync(
        resolve(directory, "package.json"),
        JSON.stringify({
          name: "copyleft-runtime",
          version: "1.0.0",
          license: "GPL-3.0-or-later",
        }),
      );
      expect(() =>
        assertDesktopDistributionLicensePolicy(
          [{ name: "copyleft-runtime", version: "1.0.0" }],
          [{ name: "copyleft-runtime", version: "1.0.0", directory }],
        ),
      ).toThrow(
        "cannot bundle strong-copyleft dependency copyleft-runtime@1.0.0",
      );

      writeFileSync(
        resolve(directory, "package.json"),
        JSON.stringify({
          name: "permissive-runtime",
          version: "1.0.0",
          license: "MIT",
        }),
      );
      expect(() =>
        assertDesktopDistributionLicensePolicy(
          [{ name: "permissive-runtime", version: "1.0.0" }],
          [{ name: "permissive-runtime", version: "1.0.0", directory }],
        ),
      ).not.toThrow();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("uses checked-in canonical text for a declared SPDX license", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "doolittle-notices-"));
    try {
      writeFileSync(
        resolve(directory, "package.json"),
        JSON.stringify({
          name: "canonical-mit",
          version: "1.0.0",
          license: "MIT",
        }),
      );
      const output = resolve(directory, "THIRD-PARTY-NOTICES.txt");
      writeRuntimeThirdPartyNotices(
        output,
        [{ name: "canonical-mit", version: "1.0.0" }],
        [{ name: "canonical-mit", version: "1.0.0", directory }],
      );
      const notices = readFileSync(output, "utf8");
      expect(notices).toContain("MIT.txt (checked-in canonical SPDX text)");
      expect(notices).toContain(
        "Permission is hereby granted, free of charge, to any person obtaining a copy",
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

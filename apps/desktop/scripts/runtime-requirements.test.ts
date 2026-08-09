import { describe, expect, it } from "vitest";
import {
  discoverDynamicCommonJsPackages,
  discoverRuntimeAssetReferences,
  runtimePackageClosure,
} from "./runtime-requirements";

describe("packaged runtime CommonJS requirements", () => {
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
});

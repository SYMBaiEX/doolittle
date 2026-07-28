import { describe, expect, it } from "vitest";
import { discoverDynamicCommonJsPackages } from "./runtime-requirements";

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
});

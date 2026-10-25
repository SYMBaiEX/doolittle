import { describe, expect, it } from "vitest";
import { validateRuntimeDependencySecurityPolicy } from "../../apps/desktop/scripts/verify-package";
import { expectedElizaPackageVersion } from "../../scripts/eliza-sdk-version-policy";

type Manifest = Parameters<typeof validateRuntimeDependencySecurityPolicy>[0];
function inventory(name: string, version: string): Manifest {
  return {
    bundledPackages: [{ name, version }],
    nativePackageClosure: [],
  } as unknown as Manifest;
}
describe("packaged runtime security floors", () => {
  it.each([
    ["file-type", "16.5.4", "22.2.0"],
    ["uuid", "9.0.1", "11.1.1"],
    ["zod", "3.25.76", "4.6.7"],
    ["body-parser", "1.20.8", "1.20.9"],
    ["body-parser", "2.3.0", "2.4.0"],
    ["undici", "6.29.0", "6.29.1"],
    ["undici", "7.30.0", "7.30.1"],
    ["undici", "8.10.2", "8.12.2"],
    ["fast-uri", "3.1.8", "3.1.9"],
    ["markdown-it", "14.3.2", "14.3.3"],
    ["ip-address", "10.7.3", "10.7.5"],
    ["toml", "4.2.0", "5.0.1"],
    ["serialize-javascript", "7.1.2", "7.1.3"],
  ])("rejects vulnerable %s@%s and accepts %s", (name, before, after) => {
    expect(() =>
      validateRuntimeDependencySecurityPolicy(inventory(name, before)),
    ).toThrow("blocked high-severity");
    expect(() =>
      validateRuntimeDependencySecurityPolicy(inventory(name, after)),
    ).not.toThrow();
  });
});

describe("independent SDK package versions", () => {
  it("allows a newer package without forcing the core baseline to move", () => {
    const versions = { "@elizaos/skills": "2.0.11-beta.7" };
    expect(
      expectedElizaPackageVersion("@elizaos/skills", "2.0.3-beta.7", versions),
    ).toBe("2.0.11-beta.7");
    expect(
      expectedElizaPackageVersion("@elizaos/core", "2.0.3-beta.7", versions),
    ).toBe("2.0.3-beta.7");
  });
  it("rejects floating package exceptions", () => {
    expect(() =>
      expectedElizaPackageVersion("@elizaos/skills", "2.0.3-beta.7", {
        "@elizaos/skills": "^2.0.11-beta.7",
      }),
    ).toThrow("exact package version");
  });
});

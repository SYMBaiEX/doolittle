import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { expect, it, vi } from "vitest";
import applicationPackage from "../../package.json" with { type: "json" };
import runtimePackage from "../../packages/agent/package.json" with {
  type: "json",
};
import { loadOperatorPackageMetadata } from "../../packages/agent/src/services/operator/version";

it("reports application-owned metadata and runtime dependencies despite workspace overrides", () => {
  const root = mkdtempSync(resolve(tmpdir(), "doolittle-version-"));
  try {
    writeFileSync(
      resolve(root, "package.json"),
      JSON.stringify({
        name: "untrusted-workspace",
        version: "99.99.99",
        devDependencies: { "@nubjs/nub": "fixture-toolchain" },
      }),
    );
    vi.stubEnv("DOOLITTLE_REPO_ROOT", root);
    expect(loadOperatorPackageMetadata()).toMatchObject({
      name: "doolittle",
      version: applicationPackage.version,
      dependencies: {
        "@elizaos/core": runtimePackage.dependencies["@elizaos/core"],
      },
      devDependencies: {
        "@nubjs/nub": applicationPackage.devDependencies["@nubjs/nub"],
      },
    });
  } finally {
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  }
});

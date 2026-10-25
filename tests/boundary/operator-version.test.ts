import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { expect, it, vi } from "vitest";
import runtimePackage from "../../packages/agent/package.json" with {
  type: "json",
};
import { loadOperatorPackageMetadata } from "../../packages/agent/src/services/operator/version";

it("reports shared runtime dependencies separately from root development tools", () => {
  const root = mkdtempSync(resolve(tmpdir(), "doolittle-version-"));
  try {
    writeFileSync(
      resolve(root, "package.json"),
      JSON.stringify({
        name: "doolittle",
        version: runtimePackage.version,
        devDependencies: { "@nubjs/nub": "fixture-toolchain" },
      }),
    );
    vi.stubEnv("DOOLITTLE_REPO_ROOT", root);
    expect(loadOperatorPackageMetadata()).toMatchObject({
      name: "doolittle",
      version: runtimePackage.version,
      dependencies: {
        "@elizaos/core": runtimePackage.dependencies["@elizaos/core"],
      },
      devDependencies: { "@nubjs/nub": "fixture-toolchain" },
    });
  } finally {
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  }
});

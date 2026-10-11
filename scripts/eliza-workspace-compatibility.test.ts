import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ELIZA_WORKSPACE_COMPATIBILITY,
  normalizeCompatibilityPackagePath,
} from "./eliza-workspace-compatibility";

describe("Eliza workspace compatibility paths", () => {
  const root = resolve(import.meta.dirname, "..");
  const rootRequire = createRequire(resolve(root, "package.json"));

  it("normalizes Windows paths to the registry's portable form", () => {
    expect(
      normalizeCompatibilityPackagePath(
        "packages\\plugin-worker-runtime\\package.json",
      ),
    ).toBe("packages/plugin-worker-runtime/package.json");
  });

  it("keeps every compatibility registry path normalized", () => {
    for (const entry of ELIZA_WORKSPACE_COMPATIBILITY) {
      expect(normalizeCompatibilityPackagePath(entry.packagePath)).toBe(
        entry.packagePath,
      );
    }
  });

  it("retains only consumed SDK compatibility contracts", () => {
    expect(
      ELIZA_WORKSPACE_COMPATIBILITY.map((entry) => entry.packageName),
    ).toEqual([
      "@elizaos/plugin-remote-manifest",
      "@elizaos/plugin-worker-runtime",
      "@elizaos/registry",
    ]);
    for (const entry of ELIZA_WORKSPACE_COMPATIBILITY) {
      const manifest = JSON.parse(
        readFileSync(resolve(root, entry.packagePath), "utf8"),
      ) as { exports: Record<string, unknown> };
      expect(Object.keys(manifest.exports)).toEqual(entry.requiredExports);
    }
    const remote = JSON.parse(
      readFileSync(
        resolve(root, "packages/plugin-remote-manifest/package.json"),
        "utf8",
      ),
    ) as { exports: { ".": Record<string, unknown> } };
    expect(remote.exports["."]).toEqual({ types: "./src/index.d.ts" });
    expect(
      existsSync(resolve(root, "packages/plugin-remote-manifest/src/index.js")),
    ).toBe(false);
    expect(
      existsSync(resolve(root, "packages/plugin-worker-runtime/src/index.js")),
    ).toBe(false);
    expect(existsSync(resolve(root, "packages/registry/src/index.js"))).toBe(
      false,
    );
    expect(rootRequire.resolve("@elizaos/plugin-worker-runtime/error")).toMatch(
      /error\.js$/u,
    );
    expect(() =>
      rootRequire.resolve("@elizaos/plugin-remote-manifest"),
    ).toThrow();
    expect(() =>
      rootRequire.resolve("@elizaos/plugin-worker-runtime"),
    ).toThrow();
    expect(() => rootRequire.resolve("@elizaos/registry")).toThrow();
  });

  it("does not install unused training and UI cloud placeholders", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(root, "package.json"), "utf8"),
    ) as {
      workspaces: string[];
      dependencies: Record<string, string>;
      overrides: Record<string, string>;
    };
    const lock = readFileSync(resolve(root, "nub.lock"), "utf8");
    for (const [name, path] of [
      ["@elizaos/app-training", "packages/app-training"],
      ["@elizaos/cloud-shared", "packages/cloud-shared"],
    ]) {
      expect(manifest.workspaces).not.toContain(path);
      expect(manifest.dependencies).not.toHaveProperty(name);
      expect(existsSync(resolve(root, path, "package.json"))).toBe(false);
      expect(() => rootRequire.resolve(name)).toThrow();
      expect(lock).not.toContain(`${path}:`);
    }
    expect(manifest.overrides["@elizaos/ui>@elizaos/cloud-shared"]).toBe("-");
    expect(lock).not.toContain("'@elizaos/cloud-shared': 2.0.3-beta.7");
  });
});

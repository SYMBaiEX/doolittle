import { describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureBootstrapDirectories, resolveBootstrapPaths } from "./paths";

describe("bootstrap program paths", () => {
  it("resolves persistence paths from the repo root", () => {
    expect(resolveBootstrapPaths("/repo")).toEqual({
      envPath: "/repo/.env",
      envExamplePath: "/repo/.env.example",
      settingsPath: "/repo/.doolittle/settings.json",
      gatewayPath: "/repo/.doolittle/gateway/gateway.json",
      onboardingPath: "/repo/.doolittle/onboarding.json",
      nativeOnboardingPath: "/repo/.doolittle/onboarding.state.json",
    });
  });

  it("creates missing directories outside check mode", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-bootstrap-paths-"));
    try {
      const created = ensureBootstrapDirectories({
        root,
        directories: [".doolittle", ".doolittle/gateway"],
        checkOnly: false,
      });
      expect(created).toEqual([".doolittle", ".doolittle/gateway"]);
      expect(existsSync(join(root, ".doolittle/gateway"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports missing directories without creating them in check mode", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-bootstrap-check-"));
    try {
      const created = ensureBootstrapDirectories({
        root,
        directories: [".doolittle"],
        checkOnly: true,
      });
      expect(created).toEqual([".doolittle (missing)"]);
      expect(existsSync(join(root, ".doolittle"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

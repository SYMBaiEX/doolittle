import { describe, expect, it } from "vitest";
import { evaluateExtensionInstallPolicy } from "./extension-policy";

function plugin(overrides: Record<string, unknown> = {}) {
  return {
    name: "@example/plugin-browser",
    description: "Browser plugin",
    stars: 1,
    repository: "https://github.com/example/plugin-browser",
    topics: [],
    latestVersion: "2.0.0",
    supports: { v0: false, v1: false, v2: true },
    npm: {
      package: "@example/plugin-browser",
      v0Version: null,
      v1Version: null,
      v2Version: "2.0.0",
    },
    ...overrides,
  };
}

describe("extension install policy", () => {
  it("requires an allowlist even for first-party metadata without inventing integrity evidence", () => {
    const policy = evaluateExtensionInstallPolicy(
      plugin({
        name: "@elizaos/plugin-browser",
        firstParty: true,
        support: "first-party",
        npm: {
          package: "@elizaos/plugin-browser",
          v0Version: null,
          v1Version: null,
          v2Version: "2.0.0",
        },
      }),
      { allowlist: ["@elizaos/plugin-browser"] },
    );

    expect(policy).toMatchObject({
      allowed: true,
      installable: true,
      installed: false,
      trust: "first-party",
      provenance: {
        packageName: "@elizaos/plugin-browser",
        version: "2.0.0",
        integrity: null,
        integrityVerified: false,
      },
    });
  });

  it("blocks first-party metadata until the canonical package is allowlisted", () => {
    const entry = plugin({
      name: "@elizaos/plugin-browser",
      firstParty: true,
      support: "first-party",
      npm: {
        package: "@elizaos/plugin-browser",
        v0Version: null,
        v1Version: null,
        v2Version: "2.0.0",
      },
    });
    expect(evaluateExtensionInstallPolicy(entry)).toMatchObject({
      allowed: false,
      installable: false,
    });
  });

  it("does not trust forged first-party or built-in metadata outside the Eliza namespace", () => {
    expect(
      evaluateExtensionInstallPolicy(
        plugin({ firstParty: true, builtIn: true, support: "first-party" }),
      ),
    ).toMatchObject({
      allowed: false,
      installable: false,
      trust: "community",
    });
  });

  it("rejects local-path overrides from version-pinned installation", () => {
    expect(
      evaluateExtensionInstallPolicy(
        plugin({ localPath: "/private/operator/plugin" }),
        { allowlist: ["@example/plugin-browser"] },
      ),
    ).toMatchObject({ allowed: true, installable: false });
  });

  it("blocks community packages until the canonical package is allowlisted", () => {
    expect(evaluateExtensionInstallPolicy(plugin()).installable).toBe(false);
    expect(
      evaluateExtensionInstallPolicy(plugin(), {
        allowlist: ["@example/plugin-browser"],
      }),
    ).toMatchObject({ allowed: true, installable: true, trust: "allowlisted" });
  });

  it("does not reinstall built-in, incompatible, versionless, or installed plugins", () => {
    expect(
      evaluateExtensionInstallPolicy(plugin({ builtIn: true })).installable,
    ).toBe(false);
    expect(
      evaluateExtensionInstallPolicy(
        plugin({ supports: { v0: false, v1: false, v2: false } }),
        { allowlist: ["@example/plugin-browser"] },
      ).installable,
    ).toBe(false);
    expect(
      evaluateExtensionInstallPolicy(
        plugin({
          latestVersion: null,
          npm: {
            package: "@example/plugin-browser",
            v0Version: null,
            v1Version: null,
            v2Version: null,
          },
        }),
        { allowlist: ["@example/plugin-browser"] },
      ).installable,
    ).toBe(false);
    expect(
      evaluateExtensionInstallPolicy(plugin(), {
        allowlist: ["@example/plugin-browser"],
        installedPackages: new Set(["@example/plugin-browser"]),
      }).installable,
    ).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { normalizeRegistryEntries } from "./RegistryPage";

describe("normalizeRegistryEntries", () => {
  it("reads Eliza registry search results and preserves trust truth", () => {
    expect(
      normalizeRegistryEntries({
        results: [
          {
            name: "@elizaos/plugin-browser",
            description: "Browser",
            latestVersion: "2.0.3-beta.7",
            policy: {
              trust: "first-party",
              installed: false,
              installable: true,
              reasons: ["First party", "No digest"],
              provenance: {
                version: "2.0.3-beta.7",
                repository: "https://github.com/elizaos-plugins/plugin-browser",
                support: "first-party",
                integrity: null,
                integrityVerified: false,
              },
            },
          },
        ],
      }),
    ).toEqual([
      expect.objectContaining({
        name: "@elizaos/plugin-browser",
        packageName: "@elizaos/plugin-browser",
        version: "2.0.3-beta.7",
        trust: "first-party",
        installable: true,
        installed: false,
        integrityVerified: false,
      }),
    ]);
  });

  it("rejects unnamed rows and accepts snapshot entries", () => {
    expect(
      normalizeRegistryEntries({
        entries: [{ name: "" }, { name: "plugin-a", policy: {} }],
      }),
    ).toHaveLength(1);
  });
});

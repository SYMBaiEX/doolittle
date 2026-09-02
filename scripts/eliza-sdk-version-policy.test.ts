import { describe, expect, it } from "vitest";
import { officialElizaDependencyVersion } from "./eliza-sdk-version-policy";

describe("Eliza SDK version policy", () => {
  it("returns exact official dependency versions", () => {
    expect(
      officialElizaDependencyVersion("@elizaos/core", "2.0.3-beta.7"),
    ).toBe("2.0.3-beta.7");
  });

  it("ignores scoped and nested override policy entries", () => {
    expect(
      officialElizaDependencyVersion("@elizaos/plugin-computeruse", {
        "puppeteer-core": "25.8.0",
      }),
    ).toBeUndefined();
    expect(
      officialElizaDependencyVersion(
        "@elizaos/plugin-discord>undici",
        "8.10.0",
      ),
    ).toBeUndefined();
  });

  it("ignores workspace and non-Eliza declarations", () => {
    expect(
      officialElizaDependencyVersion("@elizaos/core", "workspace:*"),
    ).toBeUndefined();
    expect(
      officialElizaDependencyVersion("puppeteer-core", "25.8.0"),
    ).toBeUndefined();
  });
});

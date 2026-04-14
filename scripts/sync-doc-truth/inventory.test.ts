import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { buildInventoryRows } from "./inventory";

const repoRoot = resolve(import.meta.dir, "..", "..");

describe("buildInventoryRows", () => {
  it("classifies the browser, tts, autocoder, and product runtime rows truthfully", () => {
    const rows = buildInventoryRows(repoRoot);

    expect(rows.find((row) => row.id === "browser.browser")).toEqual(
      expect.objectContaining({
        packageName: "@elizaos/plugin-browser",
        workspacePath: "packages/plugins/plugin-browser",
        kind: "adapter",
        publishIntent: "internal-adapter",
        tests: "covered",
      }),
    );

    expect(rows.find((row) => row.id === "media.tts")).toEqual(
      expect.objectContaining({
        packageName: "@elizaos/plugin-tts",
        maturity: "alpha",
        source: "vendored",
        tests: "covered",
      }),
    );

    expect(rows.find((row) => row.id === "research.autocoder")).toEqual(
      expect.objectContaining({
        packageName: "@elizaos/plugin-autocoder",
        maturity: "experimental",
        persistence: "injected",
        tests: "covered",
      }),
    );

    expect(rows.find((row) => row.id === "product.doolittle-runtime")).toEqual(
      expect.objectContaining({
        packageName: "doolittle-runtime",
        owner: "doolittle-runtime",
        publishIntent: "internal-product-layer",
        workspacePath: "packages/plugins/doolittle-plugin",
      }),
    );
  });
});

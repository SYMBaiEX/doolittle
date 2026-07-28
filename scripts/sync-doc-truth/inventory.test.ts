import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildInventoryRows } from "./inventory";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

describe("buildInventoryRows", () => {
  it("classifies the autocoder and product runtime rows truthfully", () => {
    const rows = buildInventoryRows(repoRoot);

    expect(rows.find((row) => row.id === "research.autocoder")).toEqual(
      expect.objectContaining({
        packageName: "@doolittle/plugin-autocoder",
        maturity: "experimental",
        persistence: "injected",
        owner: "doolittle-runtime",
        publishIntent: "internal-adapter",
        workspacePath: "packages/plugins/doolittle-plugin",
      }),
    );

    expect(rows.find((row) => row.id === "execution.local-sandbox")).toEqual(
      expect.objectContaining({
        packageName: "@doolittle/plugin-local-sandbox",
        owner: "doolittle-runtime",
        publishIntent: "internal-adapter",
        workspacePath: "packages/plugins/doolittle-plugin",
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

import { describe, expect, it } from "bun:test";
import type { NativeCapabilityTruthRecord } from "../../packages/agent/src/runtime/native/capability-truth";
import {
  renderCapabilityTruth,
  renderPluginInventory,
  renderPluginReadme,
} from "./render";
import type { PluginInventoryRow } from "./types";

const sampleRow: PluginInventoryRow = {
  id: "browser.browser",
  packageName: "@elizaos/plugin-browser",
  category: "browser",
  kind: "adapter",
  maturity: "alpha",
  persistence: "injected",
  source: "official",
  workspacePath: "packages/plugins/plugin-browser",
  owner: "doolittle-runtime",
  publishIntent: "internal-adapter",
  tests: "covered",
  notes: "Supports pixel captures | placeholder fallback.",
};

const sampleTruth: NativeCapabilityTruthRecord = {
  id: "browser.browser",
  packageName: "@elizaos/plugin-browser",
  headline:
    "Browser capture is truthful about pixel versus placeholder output.",
  summary: "The browser adapter exposes browser-backed capture when available.",
  runtimeSurfaces: ["GET /browser/status", "POST /browser/capture"],
  requiredStatusFields: ["captureMode", "captureReady"],
  realBehavior: [
    "Returns pixel-backed artifacts when a browser backend is available.",
  ],
  degradedBehavior: [
    "Falls back to placeholder output when browser execution is unavailable.",
  ],
  caveats: ["Pixel capture is a lightweight raster card."],
};

describe("sync-doc-truth renderers", () => {
  it("renders inventory tables with escaped notes", () => {
    const output = renderPluginInventory([sampleRow]);

    expect(output).toContain("# Plugin Inventory");
    expect(output).toContain("@elizaos/plugin-browser");
    expect(output).toContain(
      "Supports pixel captures \\| placeholder fallback.",
    );
  });

  it("renders capability truth sections with runtime surfaces and caveats", () => {
    const output = renderCapabilityTruth([sampleTruth]);

    expect(output).toContain("## @elizaos/plugin-browser");
    expect(output).toContain("- Runtime ID: `browser.browser`");
    expect(output).toContain("`GET /browser/status`, `POST /browser/capture`");
    expect(output).toContain("### Degraded Behavior");
    expect(output).toContain("Pixel capture is a lightweight raster card.");
  });

  it("renders plugin readmes from the synchronized row and truth records", () => {
    const output = renderPluginReadme(sampleRow, sampleTruth);

    expect(output).toContain("# @elizaos/plugin-browser");
    expect(output).toContain("- Kind: `adapter`");
    expect(output).toContain("- Tests: `covered`");
    expect(output).toContain("## Runtime Contract");
    expect(output).toContain(
      "- Canonical capability truth: `docs/capability-truth.md`",
    );
  });
});

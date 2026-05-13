import { describe, expect, it } from "bun:test";
import type { NativeCapabilityTruthRecord } from "../../packages/agent/src/runtime/native/capability-truth";
import type { OperatorWowContractPillar } from "../../packages/agent/src/runtime/native/operator-wow-contract";
import {
  renderCapabilityTruth,
  renderOperatorWowContract,
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

const sampleWowPillar: OperatorWowContractPillar = {
  id: "terminal-operator-loop",
  title: "Terminal Operator Loop",
  outcome:
    "The everyday shell feels like a live operator console with slash control, streaming tool progress, interruption, and recovery.",
  referenceSignals: [
    "Doolittle has a dense terminal loop with streaming tool output.",
    "OpenClaw exposes chat commands across channels.",
  ],
  elizaosLeverage: [
    "ElizaOS message handling remains the natural-language route.",
    "ElizaOS events provide action progress.",
  ],
  doolittleSurfaces: [
    "packages/agent/src/runtime/chat.ts",
    "packages/agent/src/cli.ts",
  ],
  acceptanceScenarios: [
    {
      id: "terminal-operator-loop.command-deck",
      surface: "plain CLI",
      trigger: "Run `/status` inside `doolittle`.",
      requiredSignals: [
        "Returns a compact operator result.",
        "Names degraded components.",
        "Stays on the runtime lane.",
      ],
      verification: [
        "Add command parser coverage.",
        "Run `bun test packages/agent/src/runtime`.",
      ],
      currentStatus: "partial",
    },
  ],
  currentGaps: [
    "Retry and undo are not first-class commands.",
    "Interrupt semantics need a dedicated test.",
  ],
  nextImplementationTasks: [
    {
      id: "operator-command-surface",
      title: "Promote retry and undo into slash commands.",
      ownerSurface: "operator shell",
      files: ["packages/agent/src/runtime/chat.ts", "docs/operator-loop.md"],
      definitionOfDone: [
        "Commands have parser coverage.",
        "Unavailable runtime support returns a degraded response.",
        "Operator docs match the tested output.",
      ],
    },
  ],
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

  it("renders the operator wow contract with scenarios and tasks", () => {
    const output = renderOperatorWowContract([sampleWowPillar]);

    expect(output).toContain("# Operator Wow Contract");
    expect(output).toContain("## Terminal Operator Loop");
    expect(output).toContain("#### terminal-operator-loop.command-deck");
    expect(output).toContain("- Current status: `partial`");
    expect(output).toContain("#### operator-command-surface");
    expect(output).toContain(
      "`packages/agent/src/runtime/chat.ts`, `docs/operator-loop.md`",
    );
  });
});

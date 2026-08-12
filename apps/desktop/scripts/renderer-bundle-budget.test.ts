import { describe, expect, it } from "vitest";
import {
  MAX_RENDERER_JAVASCRIPT_BYTES,
  rendererBundleBudgetFailures,
} from "./renderer-bundle-budget";

const healthy = [
  { name: "index-hash.js", bytes: 780_000 },
  { name: "CommandPalette-hash.js", bytes: 35_000 },
  { name: "ChatPage-hash.js", bytes: 120_000 },
  { name: "OrchestrationPage-hash.js", bytes: 120_000 },
  { name: "CodingWorkspacePage-hash.js", bytes: 450_000 },
  { name: "ToolsPage-hash.js", bytes: 10_000 },
  { name: "RegistryPage-hash.js", bytes: 5_000 },
  { name: "RegistryCatalogWorkspace-hash.js", bytes: 8_000 },
  { name: "McpControlPanel-hash.js", bytes: 18_000 },
  { name: "MobileConversationsDialog-hash.js", bytes: 7_000 },
];

describe("renderer bundle budget", () => {
  it("accepts the explicit route and entry budgets", () => {
    expect(rendererBundleBudgetFailures(healthy)).toEqual([]);
  });

  it("reports missing, oversized, and total regressions", () => {
    const failures = rendererBundleBudgetFailures([
      { name: "index-hash.js", bytes: MAX_RENDERER_JAVASCRIPT_BYTES + 1 },
      { name: "CommandPalette-hash.js", bytes: 40_001 },
      { name: "ChatPage-hash.js", bytes: 180_001 },
      { name: "CodingWorkspacePage-hash.js", bytes: 550_001 },
      { name: "ToolsPage-hash.js", bytes: 12_001 },
      { name: "RegistryPage-hash.js", bytes: 6_001 },
    ]);
    expect(failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining("total"),
        expect.stringContaining("initial renderer entry"),
        expect.stringContaining("lazy command palette"),
        expect.stringContaining("chat route"),
        expect.stringContaining("orchestration route bundle was not emitted"),
        expect.stringContaining("coding workspace route"),
        expect.stringContaining("tools route"),
        expect.stringContaining("registry route"),
        expect.stringContaining("lazy registry catalog bundle was not emitted"),
        expect.stringContaining("lazy MCP controls bundle was not emitted"),
        expect.stringContaining(
          "lazy mobile conversations bundle was not emitted",
        ),
      ]),
    );
  });
});

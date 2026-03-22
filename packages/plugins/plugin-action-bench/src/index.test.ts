import { describe, expect, it } from "bun:test";
import { actionBenchPlugin, benchmarkConfig } from "./index";

describe("actionBenchPlugin", () => {
  it("exposes workspace-native benchmark metadata", () => {
    expect(actionBenchPlugin.name).toBe("@elizaos/plugin-action-bench");
    expect(benchmarkConfig.totalActionsLoaded).toBeGreaterThan(0);
    expect(benchmarkConfig.packs.length).toBe(2);
  });
});

import { describe, expect, it } from "vitest";
import {
  flattenSettings,
  groupSettingsByCategory,
  settingsCategoryLabel,
} from "./SettingsFields";

describe("settings field model", () => {
  it("flattens nested runtime settings without losing their category", () => {
    expect(
      flattenSettings({ agent: { runDepth: "deep" }, mcp: { maxRetries: 3 } }),
    ).toEqual([
      { category: "agent", path: "agent.runDepth", value: "deep" },
      { category: "mcp", path: "mcp.maxRetries", value: 3 },
    ]);
  });

  it("preserves first-seen category and field ordering", () => {
    const fields = flattenSettings({
      agent: { runDepth: "deep", maxIterations: 12 },
      execution: { backend: "local" },
    });
    expect(
      groupSettingsByCategory(fields).map((group) => group.category),
    ).toEqual(["agent", "execution"]);
    expect(
      groupSettingsByCategory(fields)[0]?.fields.map((field) => field.path),
    ).toEqual(["agent.runDepth", "agent.maxIterations"]);
  });

  it("preserves interface acronyms in category labels", () => {
    expect(settingsCategoryLabel("ui")).toBe("UI");
    expect(settingsCategoryLabel("mcp")).toBe("MCP");
    expect(settingsCategoryLabel("execution")).toBe("Execution");
  });
});

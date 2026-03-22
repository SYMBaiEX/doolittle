import { describe, expect, test } from "bun:test";
import formsPlugin from ".";

describe("formsPlugin", () => {
  test("exposes a native forms service", () => {
    expect(formsPlugin.name).toBe("@elizaos/plugin-forms");
    expect(Array.isArray(formsPlugin.services)).toBe(true);
    expect(formsPlugin.services?.[0]).toBeDefined();
  });
});

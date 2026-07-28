import { describe, expect, it } from "vitest";
import {
  APP_SIDEBAR_WIDTH,
  clampPanelWidth,
  loadPanelWidth,
  savePanelWidth,
} from "./panel-layout";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    values,
  };
}

describe("panel layout persistence", () => {
  it("clamps invalid and out-of-range widths", () => {
    expect(clampPanelWidth(Number.NaN, APP_SIDEBAR_WIDTH)).toBe(
      APP_SIDEBAR_WIDTH.default,
    );
    expect(clampPanelWidth(100, APP_SIDEBAR_WIDTH)).toBe(APP_SIDEBAR_WIDTH.min);
    expect(clampPanelWidth(900, APP_SIDEBAR_WIDTH)).toBe(APP_SIDEBAR_WIDTH.max);
    expect(clampPanelWidth(318.6, APP_SIDEBAR_WIDTH)).toBe(319);
  });

  it("loads defaults and persists normalized widths", () => {
    const storage = memoryStorage();
    expect(loadPanelWidth(storage, "sidebar", APP_SIDEBAR_WIDTH)).toBe(
      APP_SIDEBAR_WIDTH.default,
    );

    savePanelWidth(storage, "sidebar", 315.8, APP_SIDEBAR_WIDTH);
    expect(storage.values.get("sidebar")).toBe("316");
    expect(loadPanelWidth(storage, "sidebar", APP_SIDEBAR_WIDTH)).toBe(316);
  });

  it("normalizes corrupted stored values to the default", () => {
    const storage = memoryStorage({ sidebar: "not-a-number" });
    expect(loadPanelWidth(storage, "sidebar", APP_SIDEBAR_WIDTH)).toBe(
      APP_SIDEBAR_WIDTH.default,
    );
  });
});

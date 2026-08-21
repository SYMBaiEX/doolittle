import { describe, expect, it } from "vitest";
import {
  APP_SIDEBAR_WIDTH,
  CHAT_TERMINAL_HEIGHT,
  clampPanelSize,
  clampPanelWidth,
  loadPanelSize,
  loadPanelWidth,
  minimumDockedUtilityViewportWidth,
  savePanelSize,
  savePanelWidth,
  UTILITY_DRAWER_WIDTH,
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
  it("reserves most of the default viewport for the active workspace", () => {
    expect(APP_SIDEBAR_WIDTH.default).toBe(264);
    expect(UTILITY_DRAWER_WIDTH.default).toBe(360);
    expect(APP_SIDEBAR_WIDTH.default).toBeLessThan(
      UTILITY_DRAWER_WIDTH.default,
    );
    expect(CHAT_TERMINAL_HEIGHT.default).toBe(280);
  });

  it("docks the utility only when the active workspace keeps a usable width", () => {
    expect(
      minimumDockedUtilityViewportWidth({
        navCollapsed: false,
        sidebarWidth: APP_SIDEBAR_WIDTH.default,
        utilityWidth: UTILITY_DRAWER_WIDTH.default,
      }),
    ).toBe(1_584);
    expect(
      minimumDockedUtilityViewportWidth({
        navCollapsed: true,
        sidebarWidth: APP_SIDEBAR_WIDTH.default,
        utilityWidth: UTILITY_DRAWER_WIDTH.default,
      }),
    ).toBe(1_388);
  });

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

  it("uses the same bounded persistence contract for panel heights", () => {
    const storage = memoryStorage({ terminal: "900" });
    expect(loadPanelSize(storage, "terminal", CHAT_TERMINAL_HEIGHT)).toBe(
      CHAT_TERMINAL_HEIGHT.max,
    );
    expect(clampPanelSize(120, CHAT_TERMINAL_HEIGHT)).toBe(
      CHAT_TERMINAL_HEIGHT.min,
    );
    savePanelSize(storage, "terminal", 316.4, CHAT_TERMINAL_HEIGHT);
    expect(storage.values.get("terminal")).toBe("316");
  });
});

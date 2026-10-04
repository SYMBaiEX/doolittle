import { describe, expect, it } from "vitest";
import { CODE_EXPLORER_WIDTH, CODE_UTILITY_WIDTH } from "./panel-layout";
import {
  CODE_EDITOR_MIN_WIDTH,
  codeWorkspaceWidthBudget,
  LEGACY_EXPLORER_VISIBLE_KEY,
  loadCodeWorkspaceLayout,
  resizeCodeWorkspaceWidths,
  saveCodeWorkspaceLayout,
  WORKSPACE_LAYOUT_STATE_KEY,
  workspaceLayoutScope,
} from "./workspace-layout-state";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    values,
  };
}

describe("workspace layout state", () => {
  const maximumPreferences = {
    explorerVisible: true,
    utilityVisible: true,
    explorerWidth: CODE_EXPLORER_WIDTH.max,
    utilityWidth: CODE_UTILITY_WIDTH.max,
  };

  it("fits simultaneous saved side maxima without consuming the editor or mutating preferences", () => {
    const preferred = { ...maximumPreferences };
    const fitted = codeWorkspaceWidthBudget(1056, preferred);
    expect(fitted.explorerWidth).toBe(326);
    expect(fitted.utilityWidth).toBe(410);
    expect(1056 - fitted.explorerWidth - fitted.utilityWidth).toBe(
      CODE_EDITOR_MIN_WIDTH,
    );
    expect(preferred).toEqual(maximumPreferences);
    expect(codeWorkspaceWidthBudget(1600, preferred)).toMatchObject({
      explorerWidth: 520,
      utilityWidth: 640,
    });
  });

  it.each([934, 960, 1056, 1200, 1600])(
    "keeps a real 320px editor reserve at grid width %i for all pane visibility combinations",
    (width) => {
      for (const explorerVisible of [true, false]) {
        for (const utilityVisible of [true, false]) {
          for (const explorerWidth of [
            CODE_EXPLORER_WIDTH.min,
            280,
            CODE_EXPLORER_WIDTH.max,
          ]) {
            for (const utilityWidth of [
              CODE_UTILITY_WIDTH.min,
              360,
              CODE_UTILITY_WIDTH.max,
            ]) {
              const fitted = codeWorkspaceWidthBudget(width, {
                explorerVisible,
                utilityVisible,
                explorerWidth,
                utilityWidth,
              });
              expect(
                width -
                  (explorerVisible ? fitted.explorerWidth : 0) -
                  (utilityVisible ? fitted.utilityWidth : 0),
              ).toBeGreaterThanOrEqual(CODE_EDITOR_MIN_WIDTH);
              expect(fitted.explorerWidth).toBeGreaterThanOrEqual(210);
              expect(fitted.utilityWidth).toBeGreaterThanOrEqual(270);
              expect(fitted.explorerWidth).toBeLessThanOrEqual(explorerWidth);
              expect(fitted.utilityWidth).toBeLessThanOrEqual(utilityWidth);
              for (const [value, bounds] of [
                [fitted.explorerWidth, fitted.explorerBounds],
                [fitted.utilityWidth, fitted.utilityBounds],
              ] as const) {
                if (
                  (bounds.min === 210 && explorerVisible) ||
                  (bounds.min === 270 && utilityVisible)
                ) {
                  expect(value).toBeLessThanOrEqual(bounds.max);
                }
                expect(bounds.max).toBeGreaterThanOrEqual(bounds.min);
                expect(bounds.default).toBeGreaterThanOrEqual(bounds.min);
                expect(bounds.default).toBeLessThanOrEqual(bounds.max);
              }
            }
          }
        }
      }
    },
  );

  it.each([0, -100, Number.NaN, Number.POSITIVE_INFINITY, 364])(
    "normalizes unmeasured and stacked width %s without invalid handle bounds or preference writes",
    (width) => {
      const preferred = { ...maximumPreferences };
      const fitted = codeWorkspaceWidthBudget(width, preferred);
      expect(fitted).toMatchObject({ explorerWidth: 210, utilityWidth: 270 });
      for (const bounds of [fitted.explorerBounds, fitted.utilityBounds]) {
        expect(Number.isFinite(bounds.max)).toBe(true);
        expect(bounds.max).toBeGreaterThanOrEqual(bounds.min);
        expect(bounds.default).toBeLessThanOrEqual(bounds.max);
      }
      expect(preferred).toEqual(maximumPreferences);
    },
  );

  it("normalizes invalid preferred widths through the existing panel bounds", () => {
    expect(
      codeWorkspaceWidthBudget(1600, {
        ...maximumPreferences,
        explorerWidth: -1,
        utilityWidth: Number.NaN,
      }),
    ).toMatchObject({ explorerWidth: 210, utilityWidth: 360 });
  });

  it.each(["explorer", "utility"] as const)(
    "resizes %s from displayed pixels without a stored-maximum dead zone",
    (pane) => {
      const fitted = codeWorkspaceWidthBudget(1056, maximumPreferences);
      const key = pane === "explorer" ? "explorerWidth" : "utilityWidth";
      const oppositeKey =
        pane === "explorer" ? "utilityWidth" : "explorerWidth";
      const shrunk = resizeCodeWorkspaceWidths(
        1056,
        maximumPreferences,
        pane,
        fitted[key] - 16,
      );
      expect(shrunk[key]).toBe(fitted[key] - 16);
      expect(shrunk[oppositeKey]).toBe(fitted[oppositeKey]);
      const current = { ...maximumPreferences, ...shrunk };
      const grown = resizeCodeWorkspaceWidths(
        1056,
        current,
        pane,
        shrunk[key] + 16,
      );
      expect(grown).toEqual({
        explorerWidth: fitted.explorerWidth,
        utilityWidth: fitted.utilityWidth,
      });
      const limited = resizeCodeWorkspaceWidths(
        1056,
        { ...current, ...grown },
        pane,
        grown[key] + 100,
      );
      expect(limited).toEqual(grown);
      expect(1056 - grown.explorerWidth - grown.utilityWidth).toBe(320);
    },
  );

  it("keeps a hidden pane's preferred size during explicit resizing of the other pane", () => {
    const layout = { ...maximumPreferences, utilityVisible: false };
    const next = resizeCodeWorkspaceWidths(1056, layout, "explorer", 300);
    expect(next).toEqual({ explorerWidth: 300, utilityWidth: 640 });
  });

  it("does not persist fitted widths merely because the window narrows", () => {
    const storage = memoryStorage();
    saveCodeWorkspaceLayout(storage, "/workspace/a", {
      ...maximumPreferences,
      zenMode: false,
    });
    const saved = storage.values.get(WORKSPACE_LAYOUT_STATE_KEY);
    const layout = loadCodeWorkspaceLayout(storage, "/workspace/a");
    codeWorkspaceWidthBudget(934, layout);
    codeWorkspaceWidthBudget(1600, layout);
    expect(storage.values.get(WORKSPACE_LAYOUT_STATE_KEY)).toBe(saved);
    expect(loadCodeWorkspaceLayout(storage, "/workspace/a")).toMatchObject(
      maximumPreferences,
    );
  });

  it("normalizes equivalent workspace paths", () => {
    expect(workspaceLayoutScope(" /Users/demo/project/ ")).toBe(
      "/Users/demo/project",
    );
    expect(workspaceLayoutScope("C:\\work\\demo\\")).toBe("C:/work/demo");
    expect(workspaceLayoutScope(" ")).toBe("__default__");
  });

  it("restores an independent layout for each workspace", () => {
    const storage = memoryStorage();
    saveCodeWorkspaceLayout(
      storage,
      "/workspace/a",
      {
        explorerVisible: false,
        utilityVisible: true,
        zenMode: true,
        explorerWidth: 240,
        utilityWidth: 500,
      },
      1,
    );
    saveCodeWorkspaceLayout(
      storage,
      "/workspace/b",
      {
        explorerVisible: true,
        utilityVisible: false,
        zenMode: false,
        explorerWidth: 420,
        utilityWidth: 300,
      },
      2,
    );

    expect(loadCodeWorkspaceLayout(storage, "/workspace/a")).toMatchObject({
      explorerVisible: false,
      utilityVisible: true,
      zenMode: true,
      explorerWidth: 240,
      utilityWidth: 500,
    });
    expect(loadCodeWorkspaceLayout(storage, "/workspace/b")).toMatchObject({
      explorerVisible: true,
      utilityVisible: false,
      zenMode: false,
      explorerWidth: 420,
      utilityWidth: 300,
    });
  });

  it("migrates legacy global preferences as the fallback", () => {
    const storage = memoryStorage({ [LEGACY_EXPLORER_VISIBLE_KEY]: "false" });
    expect(loadCodeWorkspaceLayout(storage, "/workspace/new")).toMatchObject({
      explorerVisible: false,
      utilityVisible: true,
      zenMode: false,
    });
  });

  it("bounds retained workspace histories", () => {
    const storage = memoryStorage();
    for (let index = 0; index < 40; index += 1) {
      saveCodeWorkspaceLayout(
        storage,
        `/workspace/${index}`,
        {
          explorerVisible: true,
          utilityVisible: true,
          zenMode: false,
          explorerWidth: 280,
          utilityWidth: 360,
        },
        index,
      );
    }
    const persisted = JSON.parse(
      storage.values.get(WORKSPACE_LAYOUT_STATE_KEY) ?? "{}",
    );
    expect(Object.keys(persisted.layouts)).toHaveLength(32);
    expect(persisted.layouts["/workspace/39"]).toBeDefined();
    expect(persisted.layouts["/workspace/0"]).toBeUndefined();
  });
});

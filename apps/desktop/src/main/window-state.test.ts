import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createWindowStatePersistenceController,
  DEFAULT_WINDOW_STATE,
  loadWindowState,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  type PersistableWindow,
  type PersistedWindowState,
  persistWindowState,
} from "./window-state";

describe("window-state persistence", () => {
  it("returns defaults when state file is missing", () => {
    const root = mkdtempSync(resolve(tmpdir(), "doolittle-window-state-"));
    const statePath = resolve(root, "window-state.json");
    try {
      const state = loadWindowState(statePath);
      expect(state).toEqual(DEFAULT_WINDOW_STATE);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("falls back to defaults for corrupt files", () => {
    const root = mkdtempSync(resolve(tmpdir(), "doolittle-window-state-"));
    const statePath = resolve(root, "window-state.json");
    try {
      writeFileSync(statePath, "{this is not json", "utf8");
      const state = loadWindowState(statePath);
      expect(state).toEqual(DEFAULT_WINDOW_STATE);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("clamps dimensions and preserves maximized flag", () => {
    const root = mkdtempSync(resolve(tmpdir(), "doolittle-window-state-"));
    const statePath = resolve(root, "window-state.json");
    try {
      writeFileSync(
        statePath,
        JSON.stringify({
          bounds: {
            x: 40,
            y: 60,
            width: 10,
            height: 5,
          },
          isMaximized: true,
        }),
        "utf8",
      );

      const state = loadWindowState(statePath);
      expect(state.bounds.width).toBe(MIN_WINDOW_WIDTH);
      expect(state.bounds.height).toBe(MIN_WINDOW_HEIGHT);
      expect(state.isMaximized).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects absurd off-screen geometry as corrupt", () => {
    const root = mkdtempSync(resolve(tmpdir(), "doolittle-window-state-"));
    const statePath = resolve(root, "window-state.json");
    try {
      writeFileSync(
        statePath,
        JSON.stringify({
          bounds: {
            x: 50000,
            y: 50000,
            width: 50000,
            height: 50000,
          },
          isMaximized: false,
        }),
        "utf8",
      );
      const state = loadWindowState(statePath);
      expect(state).toEqual(DEFAULT_WINDOW_STATE);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects plausible window sizes that are fully outside the current displays", () => {
    const root = mkdtempSync(resolve(tmpdir(), "doolittle-window-state-"));
    const statePath = resolve(root, "window-state.json");
    try {
      writeFileSync(
        statePath,
        JSON.stringify({
          bounds: { x: 9_000, y: 100, width: 1_320, height: 860 },
          isMaximized: false,
        }),
        "utf8",
      );
      expect(
        loadWindowState(statePath, {
          displayBounds: { x: 0, y: 0, width: 1_920, height: 1_080 },
        }),
      ).toEqual(DEFAULT_WINDOW_STATE);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("preserves a partially off-screen window when a usable edge remains visible", () => {
    const root = mkdtempSync(resolve(tmpdir(), "doolittle-window-state-"));
    const statePath = resolve(root, "window-state.json");
    const bounds = { x: -1_200, y: 80, width: 1_320, height: 860 };
    try {
      writeFileSync(
        statePath,
        JSON.stringify({ bounds, isMaximized: false }),
        "utf8",
      );
      expect(
        loadWindowState(statePath, {
          displayBounds: { x: 0, y: 0, width: 1_920, height: 1_080 },
        }).bounds,
      ).toEqual(bounds);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects windows positioned in a gap between real display work areas", () => {
    const root = mkdtempSync(resolve(tmpdir(), "doolittle-window-state-"));
    const statePath = resolve(root, "window-state.json");
    try {
      writeFileSync(
        statePath,
        JSON.stringify({
          bounds: { x: 1_960, y: 100, width: 1_000, height: 700 },
          isMaximized: false,
        }),
        "utf8",
      );
      expect(
        loadWindowState(statePath, {
          displayBounds: { x: 0, y: 0, width: 4_480, height: 1_440 },
          displayWorkAreas: [
            { x: 0, y: 0, width: 1_920, height: 1_080 },
            { x: 3_200, y: 0, width: 1_280, height: 1_440 },
          ],
        }),
      ).toEqual(DEFAULT_WINDOW_STATE);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("persists state atomically and writes readable JSON", () => {
    const root = mkdtempSync(resolve(tmpdir(), "doolittle-window-state-"));
    const statePath = resolve(root, "window-state.json");
    try {
      persistWindowState(statePath, {
        bounds: { x: 77, y: 88, width: 1_100, height: 900 },
        isMaximized: true,
      });
      const persisted = JSON.parse(readFileSync(statePath, "utf8"));
      expect(persisted).toEqual({
        bounds: { x: 77, y: 88, width: 1_100, height: 900 },
        isMaximized: true,
      });
      expect(readdirSync(root)).not.toContain("window-state.json.tmp-");
      expect(
        readdirSync(root).some((entry) =>
          entry.startsWith("window-state.json.tmp-"),
        ),
      ).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("debounces persistence to a single write when events are bursty", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "doolittle-window-state-"));
    const statePath = resolve(root, "window-state.json");
    try {
      const initialState: PersistedWindowState = {
        bounds: { x: 100, y: 100, width: 1_300, height: 800 },
        isMaximized: false,
      };
      persistWindowState(statePath, initialState);

      let current: PersistedWindowState = initialState;
      const window: PersistableWindow = {
        getBounds: () => current.bounds,
        isMaximized: () => current.isMaximized,
      };
      const controller = createWindowStatePersistenceController(
        window,
        statePath,
        { debounceMs: 30 },
      );

      current = {
        bounds: { x: 120, y: 140, width: 1_400, height: 720 },
        isMaximized: true,
      };
      controller.requestPersist();
      current = {
        bounds: { x: 140, y: 180, width: 1_500, height: 760 },
        isMaximized: true,
      };
      controller.requestPersist();
      current = {
        bounds: { x: 160, y: 220, width: 1_600, height: 780 },
        isMaximized: true,
      };
      controller.requestPersist();

      await new Promise((resolve) => setTimeout(resolve, 75));
      const state = loadWindowState(statePath);
      expect(state.isMaximized).toBe(true);
      expect(state.bounds.width).toBe(1600);

      controller.stop();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

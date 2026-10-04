import { describe, expect, it } from "vitest";
import {
  closeWorkspaceSession,
  MAX_OPEN_PANELS,
  MAX_RETAINED_CLOSED_PANELS,
  moveWorkspaceSession,
  openWorkspaceSession,
  resizeWorkspacePair,
  restoreWorkspaceLayout,
  retainWorkspacePanels,
} from "./workspace-layout";

describe("session workspace layout", () => {
  it("bounds closed React views by recency without evicting any open view", () => {
    const open = Array.from(
      { length: MAX_OPEN_PANELS },
      (_, index) => `open-${index}`,
    );
    const closed = Array.from({ length: 50 }, (_, index) => `closed-${index}`);
    const retained = retainWorkspacePanels([...open, ...closed], open);
    expect(retained).toHaveLength(MAX_OPEN_PANELS + MAX_RETAINED_CLOSED_PANELS);
    expect(retained).toEqual([
      ...closed.slice(-MAX_RETAINED_CLOSED_PANELS),
      ...open,
    ]);
    const reopened = retainWorkspacePanels(retained, [closed[0] as string]);
    const closedAgain = retainWorkspacePanels(reopened, []);
    expect(closedAgain.at(-1)).toBe(closed[0]);
    expect(closedAgain).toHaveLength(MAX_RETAINED_CLOSED_PANELS);
  });
  it("recovers malformed or incompatible storage without losing the selected session", () => {
    for (const value of [
      null,
      "{broken",
      "[]",
      JSON.stringify({ version: 2, openIds: ["a"] }),
    ]) {
      expect(restoreWorkspaceLayout(value, "selected").openIds).toEqual([
        "selected",
      ]);
    }
  });

  it("validates IDs, deduplicates, clamps geometry and enforces the cap even when restoring a different selection", () => {
    const restored = restoreWorkspaceLayout(
      JSON.stringify({
        version: 1,
        openIds: [
          "a",
          "a",
          'bad"id',
          ...Array.from({ length: 20 }, (_, index) => `s-${index}`),
        ],
        weights: { a: 90, "s-0": -5, "s-1": "2" },
        mode: "unknown",
      }),
      "selected",
    );
    expect(restored.openIds).toHaveLength(MAX_OPEN_PANELS);
    expect(new Set(restored.openIds).size).toBe(MAX_OPEN_PANELS);
    expect(restored.openIds).toContain("selected");
    expect(restored.openIds).not.toContain('bad"id');
    expect(restored.weights.a).toBe(4);
    expect(restored.weights["s-0"]).toBe(0.5);
    expect(restored.weights["s-1"]).toBe(1);
    expect(restored.mode).toBe("tiles");
  });

  it("closes the final view without inventing a new session and can reopen the same identity", () => {
    const closed = closeWorkspaceSession(
      restoreWorkspaceLayout(null, "a"),
      "a",
    );
    expect(closed.openIds).toEqual([]);
    expect(closed.focusedId).toBe("");
    expect(openWorkspaceSession(closed, "a").openIds).toEqual(["a"]);
  });

  it("focuses existing sessions without duplicating panels and refuses a thirteenth view", () => {
    let layout = restoreWorkspaceLayout(null, "a");
    layout = openWorkspaceSession(layout, "b");
    expect(openWorkspaceSession(layout, "a").openIds).toEqual(["a", "b"]);
    for (let index = 2; index < MAX_OPEN_PANELS; index += 1)
      layout = openWorkspaceSession(layout, `s-${index}`);
    expect(openWorkspaceSession(layout, "extra")).toBe(layout);
  });

  it("persists arrangement and focused/tabbed preference, with adjacent bounded keyboard/pointer resizing", () => {
    const original = openWorkspaceSession(
      restoreWorkspaceLayout(null, "a"),
      "b",
    );
    const moved = moveWorkspaceSession(original, "b", -1);
    expect(moved.openIds).toEqual(["b", "a"]);
    const resized = resizeWorkspacePair(moved, "a", "b", 100);
    expect(resized.weights).toEqual({ a: 1.5, b: 0.5 });
    expect(resizeWorkspacePair(resized, "a", "b", -100).weights).toEqual({
      a: 0.5,
      b: 1.5,
    });
    expect(resizeWorkspacePair(resized, "a", "b", Number.NaN)).toBe(resized);
    const stored = { ...resized, mode: "focus" as const };
    expect(restoreWorkspaceLayout(JSON.stringify(stored), "b")).toEqual(stored);
  });
});

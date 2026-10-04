import { describe, expect, it } from "vitest";
import {
  closeWorkspaceSession,
  MAX_OPEN_PANELS,
  MAX_RETAINED_CLOSED_PANELS,
  moveWorkspaceSession,
  openWorkspaceSession,
  resizeWorkspaceSplit,
  restoreWorkspaceLayout,
  retainWorkspacePanels,
  splitWorkspaceSession,
  workspaceGeometry,
  workspaceRequiredSize,
} from "./workspace-layout";

describe("session workspace split layout", () => {
  it("bounds closed React views without evicting open views", () => {
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
  });

  it("migrates v1 weighted tiles, validates IDs, and keeps the selected session", () => {
    const layout = restoreWorkspaceLayout(
      JSON.stringify({
        version: 1,
        openIds: ["a", "a", 'bad"id', "b"],
        mode: "tiles",
        weights: { a: 2 },
      }),
      "b",
    );
    expect(layout.version).toBe(2);
    expect(layout.openIds).toEqual(["a", "b"]);
    expect(layout.mode).toBe("split");
    expect(layout.focusedId).toBe("b");
    expect(workspaceGeometry(layout.tree).panels.b).toBeDefined();
    expect(restoreWorkspaceLayout("{broken", "selected").openIds).toEqual([
      "selected",
    ]);
  });

  it("keeps tabs as default; explicit right/below splits nest and resize", () => {
    let layout = restoreWorkspaceLayout(null, "a");
    layout = openWorkspaceSession(layout, "b");
    layout = openWorkspaceSession(layout, "c");
    expect(layout.mode).toBe("tabs");
    layout = splitWorkspaceSession(layout, "a", "b", "horizontal");
    layout = splitWorkspaceSession(layout, "b", "c", "vertical");
    expect(layout.mode).toBe("split");
    expect(workspaceRequiredSize(layout.tree)).toEqual({
      width: 720,
      height: 560,
    });
    const geometry = workspaceGeometry(layout.tree);
    expect(geometry.dividers).toHaveLength(2);
    expect(Object.keys(geometry.panels)).toEqual(
      expect.arrayContaining(["a", "b", "c"]),
    );
    const divider = geometry.dividers.find((item) => item.axis === "vertical");
    expect(divider).toBeDefined();
    layout = resizeWorkspaceSplit(layout, divider?.path ?? "", 0.75);
    expect(
      workspaceGeometry(layout.tree).dividers.find(
        (item) => item.path === divider?.path,
      )?.ratio,
    ).toBe(0.75);
    expect(restoreWorkspaceLayout(JSON.stringify(layout), "c")).toEqual(layout);
  });

  it("closes a view without cancelling its run and collapses the tree", () => {
    const first = openWorkspaceSession(restoreWorkspaceLayout(null, "a"), "b");
    const split = splitWorkspaceSession(first, "a", "b", "vertical");
    const closed = closeWorkspaceSession(split, "b");
    expect(closed.openIds).toEqual(["a"]);
    expect(closed.tree).toEqual({ type: "leaf", id: "a" });
    expect(closed.mode).toBe("tabs");
    expect(openWorkspaceSession(closed, "b").openIds).toEqual(["a", "b"]);
  });

  it("enforces twelve open views and supports keyboard reorder", () => {
    let layout = restoreWorkspaceLayout(null, "a");
    for (let index = 1; index < MAX_OPEN_PANELS; index++)
      layout = openWorkspaceSession(layout, `s-${index}`);
    expect(openWorkspaceSession(layout, "extra")).toBe(layout);
    expect(moveWorkspaceSession(layout, "s-1", -1).openIds[0]).toBe("s-1");
  });
});

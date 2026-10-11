import { describe, expect, it } from "vitest";
import {
  arrangeWorkspaceSessions,
  balanceWorkspaceSizes,
  closeOtherWorkspaceSessions,
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
  it("arranges every open view in tab order with equal space, including twelve views", () => {
    let layout = restoreWorkspaceLayout(null, "a");
    for (let index = 1; index < MAX_OPEN_PANELS; index++)
      layout = openWorkspaceSession(layout, `s-${index}`);
    // Ordinary opening no longer creates exponentially deep 50/50 roots.
    expect(workspaceRequiredSize(layout.tree).width).toBeLessThanOrEqual(5760);
    for (const axis of ["horizontal", "vertical"] as const) {
      const arranged = arrangeWorkspaceSessions(layout, axis);
      const panels = workspaceGeometry(arranged.tree).panels;
      expect(Object.keys(panels)).toEqual(layout.openIds);
      for (const pane of Object.values(panels)) {
        expect(axis === "horizontal" ? pane.width : pane.height).toBeCloseTo(
          100 / MAX_OPEN_PANELS,
        );
      }
      expect(arranged.focusedId).toBe(layout.focusedId);
      expect(workspaceRequiredSize(arranged.tree)).toEqual(
        axis === "horizontal"
          ? { width: 4320, height: 280 }
          : { width: 360, height: 3360 },
      );
    }
  });

  it("retains split presentation and existing root proportions when adding or reopening a view", () => {
    const first = openWorkspaceSession(restoreWorkspaceLayout(null, "a"), "b");
    const arranged = resizeWorkspaceSplit(
      arrangeWorkspaceSessions(first, "vertical"),
      "",
      0.65,
    );
    const opened = openWorkspaceSession(arranged, "c");
    expect(opened.mode).toBe("split");
    expect(opened.tree).toMatchObject({ axis: "vertical", ratio: 0.65 });
    expect(opened.focusedId).toBe("c");
    expect(Object.keys(workspaceGeometry(opened.tree).panels)).toHaveLength(3);
    expect(opened.openIds).toEqual(
      Object.keys(workspaceGeometry(opened.tree).panels),
    );
  });

  it("keeps tab order aligned to physical positions when split-mode addition inserts into an existing branch", () => {
    const first = openWorkspaceSession(restoreWorkspaceLayout(null, "a"), "b");
    const opened = openWorkspaceSession(
      arrangeWorkspaceSessions(first, "horizontal"),
      "c",
    );
    expect(opened.openIds).toEqual(["a", "c", "b"]);
    expect(workspaceGeometry(opened.tree).panels.c?.x).toBe(25);
    const moved = moveWorkspaceSession(opened, "c", -1);
    expect(moved.openIds).toEqual(["c", "a", "b"]);
    expect(workspaceGeometry(moved.tree).panels.c?.x).toBe(0);
    expect(workspaceGeometry(moved.tree).panels.a?.x).toBe(25);
    expect(openWorkspaceSession(first, "c").openIds).toEqual(["a", "b", "c"]);
  });

  it("moves physical split leaves together with tab order without duplicating identities", () => {
    const arranged = arrangeWorkspaceSessions(
      openWorkspaceSession(restoreWorkspaceLayout(null, "a"), "b"),
      "horizontal",
    );
    const moved = moveWorkspaceSession(arranged, "b", -1);
    expect(moved.openIds).toEqual(["b", "a"]);
    expect(workspaceGeometry(moved.tree).panels.b?.x).toBe(0);
    expect(workspaceGeometry(moved.tree).panels.a?.x).toBe(50);
    expect(moved.focusedId).toBe("b");
  });

  it("balances unequal nested sizes and reports each divider's actual subtree extent", () => {
    let layout = restoreWorkspaceLayout(null, "a");
    layout = openWorkspaceSession(layout, "b");
    layout = openWorkspaceSession(layout, "c");
    layout = splitWorkspaceSession(layout, "a", "b", "horizontal");
    layout = splitWorkspaceSession(layout, "b", "c", "horizontal");
    const nested = workspaceGeometry(layout.tree).dividers.find(
      (divider) => divider.path === "1",
    );
    expect(nested).toMatchObject({
      width: 0,
      parentWidth: 50,
      parentHeight: 100,
    });
    layout = resizeWorkspaceSplit(layout, "", 0.8);
    layout = resizeWorkspaceSplit(layout, "1", 0.75);
    const balanced = balanceWorkspaceSizes(layout);
    expect(workspaceRequiredSize(balanced.tree)).toEqual({
      width: 1080,
      height: 280,
    });
    for (const pane of Object.values(workspaceGeometry(balanced.tree).panels))
      expect(pane.width).toBeCloseTo(100 / 3);
    expect(
      restoreWorkspaceLayout(JSON.stringify(balanced), balanced.focusedId),
    ).toEqual(balanced);
  });

  it("closes other views without changing the kept identity and handles empty arrangements", () => {
    const layout = openWorkspaceSession(restoreWorkspaceLayout(null, "a"), "b");
    expect(closeOtherWorkspaceSessions(layout, "a")).toMatchObject({
      openIds: ["a"],
      focusedId: "a",
      tree: { type: "leaf", id: "a" },
    });
    expect(closeOtherWorkspaceSessions(layout, "unknown")).toBe(layout);
    const empty = closeWorkspaceSession(restoreWorkspaceLayout(null, "a"), "a");
    expect(arrangeWorkspaceSessions(empty, "horizontal")).toMatchObject({
      openIds: [],
      tree: null,
      mode: "tabs",
    });
  });

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

  it("falls back before an unequal nested split squeezes any pane below its minimum", () => {
    const tree = {
      type: "split" as const,
      axis: "horizontal" as const,
      ratio: 0.8,
      first: {
        type: "split" as const,
        axis: "vertical" as const,
        ratio: 0.75,
        first: { type: "leaf" as const, id: "a" },
        second: { type: "leaf" as const, id: "b" },
      },
      second: { type: "leaf" as const, id: "c" },
    };
    const required = workspaceRequiredSize(tree);
    expect(required.width).toBeGreaterThanOrEqual(1800);
    expect(required.height).toBe(1120);
    for (const pane of Object.values(workspaceGeometry(tree).panels)) {
      expect((pane.width / 100) * required.width).toBeGreaterThanOrEqual(360);
      expect((pane.height / 100) * required.height).toBeGreaterThanOrEqual(280);
    }
    expect(tree.ratio).toBe(0.8);
    expect(tree.first.ratio).toBe(0.75);
  });

  it("enforces twelve open views and supports keyboard reorder", () => {
    let layout = restoreWorkspaceLayout(null, "a");
    for (let index = 1; index < MAX_OPEN_PANELS; index++)
      layout = openWorkspaceSession(layout, `s-${index}`);
    expect(openWorkspaceSession(layout, "extra")).toBe(layout);
    expect(moveWorkspaceSession(layout, "s-1", -1).openIds[0]).toBe("s-1");
  });
});

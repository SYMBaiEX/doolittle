import { describe, expect, it, vi } from "vitest";
import { openExclusiveProjectManager } from "../../apps/desktop/src/renderer/app-shell/shell-overlay-state";

describe("desktop overlay ownership", () => {
  it("closes competing shell overlays without focus restoration before opening projects", () => {
    const calls: unknown[][] = [];
    const closeTerminal = vi.fn((restoreFocus?: boolean) => {
      calls.push(["terminal", restoreFocus]);
    });
    const setMobileSidebarOpen = vi.fn(
      (open: boolean, restoreFocus?: boolean) => {
        calls.push(["sidebar", open, restoreFocus]);
      },
    );
    const setProjectManagerOpen = vi.fn((open: boolean) => {
      calls.push(["project-manager", open]);
    });

    openExclusiveProjectManager({
      closeTerminal,
      setMobileSidebarOpen,
      setProjectManagerOpen,
    });

    expect(calls).toEqual([
      ["terminal", false],
      ["sidebar", false, false],
      ["project-manager", true],
    ]);
  });
});

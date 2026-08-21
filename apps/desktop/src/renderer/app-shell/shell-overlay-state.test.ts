// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  applyShellOverlayState,
  utilityReturnFocusTarget,
} from "./shell-overlay-state";

function element(): HTMLElement {
  return document.createElement("div");
}

describe("shell overlay state", () => {
  it("keeps modal utility isolation across mobile-sidebar breakpoints", () => {
    const appMain = element();
    const sidebar = element();

    for (const isMobileSidebarMode of [false, true, false]) {
      applyShellOverlayState(
        { appMain, sidebar },
        {
          isMobileSidebarMode,
          mobileSidebarOpen: false,
          utilityModalOpen: true,
        },
      );
      expect(appMain.hasAttribute("inert")).toBe(true);
      expect(appMain.getAttribute("aria-hidden")).toBe("true");
      expect(sidebar.hasAttribute("inert")).toBe(true);
    }
  });

  it("hands isolation between the sidebar and the normal shell", () => {
    const appMain = element();
    const sidebar = element();

    applyShellOverlayState(
      { appMain, sidebar },
      {
        isMobileSidebarMode: true,
        mobileSidebarOpen: true,
        utilityModalOpen: false,
      },
    );
    expect(appMain.hasAttribute("inert")).toBe(true);
    expect(sidebar.hasAttribute("inert")).toBe(false);

    applyShellOverlayState(
      { appMain, sidebar },
      {
        isMobileSidebarMode: false,
        mobileSidebarOpen: false,
        utilityModalOpen: false,
      },
    );
    expect(appMain.hasAttribute("inert")).toBe(false);
    expect(appMain.hasAttribute("aria-hidden")).toBe(false);
    expect(sidebar.hasAttribute("inert")).toBe(false);
  });

  it("returns utility focus to the mobile navigation trigger", () => {
    const navigationTrigger = element();
    const sidebarToolsButton = element();
    expect(
      utilityReturnFocusTarget({
        activeElement: sidebarToolsButton,
        mobileSidebarOpen: true,
        sidebarReturnTarget: navigationTrigger,
      }),
    ).toBe(navigationTrigger);
    expect(
      utilityReturnFocusTarget({
        activeElement: sidebarToolsButton,
        mobileSidebarOpen: false,
        sidebarReturnTarget: navigationTrigger,
      }),
    ).toBe(sidebarToolsButton);
  });
});

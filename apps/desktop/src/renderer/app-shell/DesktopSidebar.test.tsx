// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DesktopSidebar } from "./DesktopSidebar";

describe("DesktopSidebar", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("renders a labeled, vertical icon rail when desktop navigation is collapsed", () => {
    const onViewAll = vi.fn();
    const onSetView = vi.fn();
    act(() =>
      root.render(
        <main className="desktop-shell nav-collapsed">
          <DesktopSidebar
            isMobileSidebarMode={false}
            mobileSidebarOpen={false}
            navCollapsed
            newConversationMenuOpen={false}
            navigationView="code"
            onChooseRepository={vi.fn()}
            onClose={vi.fn()}
            onManageProjects={vi.fn()}
            onOpenPalette={vi.fn()}
            onOpenSession={vi.fn()}
            onPreloadView={vi.fn()}
            onResize={vi.fn()}
            onSelectScope={vi.fn()}
            onSetNewConversationMenuOpen={vi.fn()}
            onSetView={onSetView}
            onSidebarKeyDown={vi.fn()}
            onStartConversation={vi.fn()}
            onToggleAppearance={vi.fn()}
            onToggleNavigation={vi.fn()}
            onToggleUtilities={vi.fn()}
            onViewAll={onViewAll}
            platform="darwin"
            projectCards={[]}
            projectScope="all"
            resolvedAppearance="dark"
            selectedSession=""
            sessions={[]}
            sidebarOpen
            sidebarRef={{ current: null }}
            sidebarWidth={264}
            utilityOpen={false}
            view="chat"
            workspacePath="/workspace/doolittle"
          />
        </main>,
      ),
    );

    const modeSwitch = container.querySelector(".sidebar-mode-switch");
    expect(modeSwitch?.className).toContain("nav-collapsed_&]:grid-cols-1");

    for (const label of ["Chat", "Code", "Work"]) {
      expect(
        container.querySelector(`button[aria-label="${label}"]`),
      ).not.toBeNull();
    }
    expect(
      container.querySelector("button[aria-label='Open conversation history']"),
    ).not.toBeNull();
    expect(
      container.querySelector("button[aria-label='Open settings']"),
    ).not.toBeNull();
    expect(
      container.querySelector("button[aria-current='page']"),
    ).not.toBeNull();

    const history = container.querySelector<HTMLButtonElement>(
      "button[aria-label='Open conversation history']",
    );
    act(() => history?.click());
    expect(onViewAll).toHaveBeenCalledOnce();

    const home = container.querySelector<HTMLButtonElement>(
      "button[aria-label='Go to Home']",
    );
    act(() => home?.click());
    expect(onSetView).toHaveBeenCalledWith("dashboard");

    const utilityMark = container.querySelector(".sidebar-utility-mark");
    expect(utilityMark?.className).toContain("[&>svg]:size-3.5");
  });
});

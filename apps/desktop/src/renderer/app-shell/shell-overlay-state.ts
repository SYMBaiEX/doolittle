export interface ShellOverlayElements {
  appMain: HTMLElement;
  sidebar: HTMLElement;
}

export interface ShellOverlayState {
  isMobileSidebarMode: boolean;
  mobileSidebarOpen: boolean;
  utilityModalOpen: boolean;
}

function setInert(element: HTMLElement, inert: boolean): void {
  if (inert) element.setAttribute("inert", "");
  else element.removeAttribute("inert");
}

function setHidden(element: HTMLElement, hidden: boolean): void {
  if (hidden) element.setAttribute("aria-hidden", "true");
  else element.removeAttribute("aria-hidden");
}

/**
 * Gives one policy sole ownership of shell background isolation. Utility
 * modals take priority over the mobile navigation sheet so breakpoint changes
 * cannot make the background interactive while an aria-modal surface remains.
 */
export function applyShellOverlayState(
  elements: ShellOverlayElements,
  state: ShellOverlayState,
): void {
  if (state.utilityModalOpen) {
    setInert(elements.sidebar, true);
    setInert(elements.appMain, true);
    setHidden(elements.appMain, true);
    return;
  }

  if (state.isMobileSidebarMode) {
    setInert(elements.sidebar, !state.mobileSidebarOpen);
    setInert(elements.appMain, state.mobileSidebarOpen);
    setHidden(elements.appMain, state.mobileSidebarOpen);
    return;
  }

  setInert(elements.sidebar, false);
  setInert(elements.appMain, false);
  setHidden(elements.appMain, false);
}

export function utilityReturnFocusTarget({
  activeElement,
  mobileSidebarOpen,
  sidebarReturnTarget,
}: {
  activeElement: HTMLElement | null;
  mobileSidebarOpen: boolean;
  sidebarReturnTarget: HTMLElement | null;
}): HTMLElement | null {
  return mobileSidebarOpen ? sidebarReturnTarget : activeElement;
}

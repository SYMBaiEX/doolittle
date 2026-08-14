import type { BrowserWindow } from "electron";

export interface DesktopLifecycleState {
  keepRunningInBackground: boolean;
}

export const DEFAULT_DESKTOP_LIFECYCLE_STATE: DesktopLifecycleState = {
  keepRunningInBackground: false,
};

/** Keeps close behaviour deliberate: hiding is only allowed after opting in. */
export function shouldHideOnClose(
  state: DesktopLifecycleState,
  quitting: boolean,
): boolean {
  return state.keepRunningInBackground && !quitting;
}

export function handleWindowClose(
  window: Pick<BrowserWindow, "hide">,
  event: Pick<Electron.Event, "preventDefault">,
  state: DesktopLifecycleState,
  quitting: boolean,
): boolean {
  if (!shouldHideOnClose(state, quitting)) return false;
  event.preventDefault();
  window.hide();
  return true;
}

/** The native prompt keeps the window open only for the explicit Stay choice. */
export function shouldStayOnDirtyClosePrompt(response: number): boolean {
  return response === 0;
}

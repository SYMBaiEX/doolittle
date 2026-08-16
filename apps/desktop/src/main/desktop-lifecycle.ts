import type { BrowserWindow } from "electron";

export interface DesktopLifecycleState {
  keepRunningInBackground: boolean;
}

export const DEFAULT_DESKTOP_LIFECYCLE_STATE: DesktopLifecycleState = {
  keepRunningInBackground: false,
};

export interface DesktopSingleInstanceApp {
  requestSingleInstanceLock(): boolean;
  quit(): void;
  on(event: "second-instance", listener: () => void): unknown;
}

/** Prevents multiple desktop runtimes from sharing one private data directory. */
export function configureDesktopSingleInstance(
  application: DesktopSingleInstanceApp,
  onSecondInstance: () => void,
): boolean {
  if (!application.requestSingleInstanceLock()) {
    application.quit();
    return false;
  }
  application.on("second-instance", onSecondInstance);
  return true;
}

/** Reuses a live window and replaces one that has already been destroyed. */
export function ensureDesktopWindow<
  TWindow extends Pick<BrowserWindow, "isDestroyed">,
>(current: TWindow | null, create: () => TWindow): TWindow {
  return !current || current.isDestroyed() ? create() : current;
}

/** Keeps close behaviour deliberate: hiding is only allowed after opting in. */
export function shouldHideOnClose(
  state: DesktopLifecycleState,
  quitting: boolean,
): boolean {
  return state.keepRunningInBackground && !quitting;
}

/** The final window ends the process unless background mode was explicitly enabled. */
export function shouldQuitAfterAllWindowsClosed(
  state: DesktopLifecycleState,
): boolean {
  return !state.keepRunningInBackground;
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

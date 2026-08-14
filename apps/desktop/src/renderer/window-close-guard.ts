export interface BeforeUnloadGuardEvent {
  preventDefault: () => void;
  returnValue: string;
}

/** Prevents Electron/browser window teardown while the Code editor has a draft. */
export function guardDirtyCodeWorkspaceClose(
  event: BeforeUnloadGuardEvent,
  dirty: boolean,
): boolean {
  if (!dirty) return false;
  event.preventDefault();
  event.returnValue = "";
  return true;
}

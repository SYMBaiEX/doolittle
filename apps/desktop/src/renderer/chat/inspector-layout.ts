import type { StorageLike } from "../conversation-persistence";
import { safeSetStorageItem } from "../conversation-persistence";
import {
  APPEARANCE_APPLIED_EVENT,
  THEME_MANIFEST_CHANGE_EVENT,
} from "../desktop-theme";
import { clampPanelSize } from "../panel-layout";

export const INSPECTOR_WIDTH_KEY =
  "doolittle.desktop.layout.inspector-width.v1";
export const INSPECTOR_WIDTH = { default: 320, min: 280, max: 560 } as const;
export const INSPECTOR_SHEET_WIDTH = 720;
const MIN_CONVERSATION_WIDTH = 400;

export function observeInspectorGeometry(
  panel: HTMLElement,
  onGeometry: (geometry: { paneWidth: number; themeWidth: number }) => void,
): () => void {
  const update = () => {
    const tokenWidth = Number.parseFloat(
      getComputedStyle(panel).getPropertyValue("--inspector-width"),
    );
    onGeometry({
      paneWidth: panel.clientWidth,
      themeWidth: Number.isFinite(tokenWidth)
        ? tokenWidth
        : INSPECTOR_WIDTH.default,
    });
  };
  update();
  const observer =
    typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
  observer?.observe(panel);
  window.addEventListener(THEME_MANIFEST_CHANGE_EVENT, update);
  window.addEventListener(APPEARANCE_APPLIED_EVENT, update);
  return () => {
    observer?.disconnect();
    window.removeEventListener(THEME_MANIFEST_CHANGE_EVENT, update);
    window.removeEventListener(APPEARANCE_APPLIED_EVENT, update);
  };
}

/** Keep a user's preference separate from responsive, temporary reductions. */
export function loadInspectorWidth(
  storage: Pick<StorageLike, "getItem">,
): number | null {
  try {
    const value: unknown = JSON.parse(
      storage.getItem(INSPECTOR_WIDTH_KEY) ?? "null",
    );
    return typeof value === "number" && Number.isFinite(value)
      ? clampPanelSize(value, INSPECTOR_WIDTH)
      : null;
  } catch {
    return null;
  }
}

export function saveInspectorWidth(
  storage: StorageLike,
  value: number | null,
): boolean {
  return safeSetStorageItem(
    storage,
    INSPECTOR_WIDTH_KEY,
    JSON.stringify(
      value === null ? null : clampPanelSize(value, INSPECTOR_WIDTH),
    ),
  );
}

/** Inspector geometry is local to a conversation tile, not the whole window. */
export function inspectorResizeBounds(
  paneWidth: number,
  themeWidth: number = INSPECTOR_WIDTH.default,
) {
  const max =
    Number.isFinite(paneWidth) && paneWidth > 0
      ? Math.max(
          INSPECTOR_WIDTH.min,
          Math.min(
            INSPECTOR_WIDTH.max,
            Math.floor(paneWidth - MIN_CONVERSATION_WIDTH),
          ),
        )
      : INSPECTOR_WIDTH.max;
  const bounds = {
    min: INSPECTOR_WIDTH.min,
    max,
    default: INSPECTOR_WIDTH.default as number,
  };
  return { ...bounds, default: clampPanelSize(themeWidth, bounds) };
}

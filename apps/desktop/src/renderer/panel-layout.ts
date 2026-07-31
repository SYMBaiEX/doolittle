export const APP_SIDEBAR_WIDTH_KEY =
  "doolittle.desktop.layout.sidebar-width.v2";
export const UTILITY_DRAWER_WIDTH_KEY =
  "doolittle.desktop.layout.utility-drawer-width.v2";
export const CODE_EXPLORER_WIDTH_KEY =
  "doolittle.desktop.code.explorer-width.v1";
export const CODE_UTILITY_WIDTH_KEY = "doolittle.desktop.code.utility-width.v1";

export const APP_SIDEBAR_WIDTH = {
  default: 280,
  min: 244,
  max: 340,
} as const;

export const UTILITY_DRAWER_WIDTH = {
  default: 380,
  min: 292,
  max: 560,
} as const;

export const CODE_EXPLORER_WIDTH = {
  default: 280,
  min: 210,
  max: 520,
} as const;

export const CODE_UTILITY_WIDTH = {
  default: 360,
  min: 270,
  max: 640,
} as const;

export interface PanelWidthStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function clampPanelWidth(
  value: number,
  bounds: { default: number; min: number; max: number },
): number {
  if (!Number.isFinite(value)) return bounds.default;
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(value)));
}

export function loadPanelWidth(
  storage: Pick<PanelWidthStorage, "getItem">,
  key: string,
  bounds: { default: number; min: number; max: number },
): number {
  const stored = storage.getItem(key);
  return stored === null
    ? bounds.default
    : clampPanelWidth(Number(stored), bounds);
}

export function savePanelWidth(
  storage: Pick<PanelWidthStorage, "setItem">,
  key: string,
  value: number,
  bounds: { default: number; min: number; max: number },
): void {
  storage.setItem(key, String(clampPanelWidth(value, bounds)));
}

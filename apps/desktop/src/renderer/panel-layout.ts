export const APP_SIDEBAR_WIDTH_KEY =
  "doolittle.desktop.layout.sidebar-width.v2";
export const UTILITY_DRAWER_WIDTH_KEY =
  "doolittle.desktop.layout.utility-drawer-width.v2";
export const CODE_EXPLORER_WIDTH_KEY =
  "doolittle.desktop.code.explorer-width.v1";
export const CODE_UTILITY_WIDTH_KEY = "doolittle.desktop.code.utility-width.v1";
export const CHAT_TERMINAL_HEIGHT_KEY =
  "doolittle.desktop.chat.terminal-height.v1";

export const APP_SIDEBAR_WIDTH = {
  default: 264,
  min: 232,
  max: 328,
} as const;

export const UTILITY_DRAWER_WIDTH = {
  default: 360,
  min: 292,
  max: 520,
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

export const CHAT_TERMINAL_HEIGHT = {
  default: 280,
  min: 180,
  max: 560,
} as const;

export const APP_SIDEBAR_COMPACT_WIDTH = 68;
export const MIN_DOCKED_WORKSPACE_WIDTH = 960;

export function minimumDockedUtilityViewportWidth({
  navCollapsed,
  sidebarWidth,
  utilityWidth,
}: {
  navCollapsed: boolean;
  sidebarWidth: number;
  utilityWidth: number;
}): number {
  const navigationWidth = navCollapsed
    ? APP_SIDEBAR_COMPACT_WIDTH
    : clampPanelSize(sidebarWidth, APP_SIDEBAR_WIDTH);
  return (
    navigationWidth +
    clampPanelSize(utilityWidth, UTILITY_DRAWER_WIDTH) +
    MIN_DOCKED_WORKSPACE_WIDTH
  );
}

export interface PanelWidthStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function clampPanelSize(
  value: number,
  bounds: { default: number; min: number; max: number },
): number {
  if (!Number.isFinite(value)) return bounds.default;
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(value)));
}

export const clampPanelWidth = clampPanelSize;

export function loadPanelSize(
  storage: Pick<PanelWidthStorage, "getItem">,
  key: string,
  bounds: { default: number; min: number; max: number },
): number {
  const stored = storage.getItem(key);
  return stored === null
    ? bounds.default
    : clampPanelSize(Number(stored), bounds);
}

export const loadPanelWidth = loadPanelSize;

export function savePanelSize(
  storage: Pick<PanelWidthStorage, "setItem">,
  key: string,
  value: number,
  bounds: { default: number; min: number; max: number },
): void {
  storage.setItem(key, String(clampPanelSize(value, bounds)));
}

export const savePanelWidth = savePanelSize;

import type { View } from "../desktop-navigation";

export interface DesktopNavigationHistory {
  readonly entries: readonly View[];
  readonly index: number;
}

export function createDesktopNavigationHistory(
  initialView: View,
): DesktopNavigationHistory {
  return { entries: [initialView], index: 0 };
}

export function pushDesktopNavigationHistory(
  history: DesktopNavigationHistory,
  view: View,
): DesktopNavigationHistory {
  if (history.entries[history.index] === view) return history;
  return {
    entries: [...history.entries.slice(0, history.index + 1), view],
    index: history.index + 1,
  };
}

export function desktopNavigationTarget(
  history: DesktopNavigationHistory,
  offset: -1 | 1,
): { history: DesktopNavigationHistory; view: View } | null {
  const index = history.index + offset;
  const view = history.entries[index];
  if (!view) return null;
  return {
    history: { ...history, index },
    view,
  };
}

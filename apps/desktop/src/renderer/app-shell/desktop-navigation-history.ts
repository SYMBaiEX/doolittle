import { type ComputerOrigin, computerOriginKey } from "../computer-origin";
import type { View } from "../desktop-navigation";

export interface DesktopNavigationEntry {
  readonly view: View;
  readonly computerOrigin?: ComputerOrigin;
}

interface DesktopNavigationHistory {
  readonly entries: readonly DesktopNavigationEntry[];
  readonly index: number;
}

export function createDesktopNavigationHistory(
  initial: DesktopNavigationEntry,
): DesktopNavigationHistory {
  return { entries: [initial], index: 0 };
}

export function pushDesktopNavigationHistory(
  history: DesktopNavigationHistory,
  next: DesktopNavigationEntry,
): DesktopNavigationHistory {
  const current = history.entries[history.index];
  if (
    current?.view === next.view &&
    current.computerOrigin?.workspacePath ===
      next.computerOrigin?.workspacePath &&
    computerOriginKey(current.computerOrigin) ===
      computerOriginKey(next.computerOrigin)
  )
    return history;
  const entries = [...history.entries.slice(0, history.index + 1), next];
  return { entries, index: entries.length - 1 };
}

export function replaceDesktopNavigationEntry(
  history: DesktopNavigationHistory,
  entry: DesktopNavigationEntry,
): DesktopNavigationHistory {
  const entries = [...history.entries];
  entries[history.index] = entry;
  return { entries, index: history.index };
}

export function desktopNavigationTarget(
  history: DesktopNavigationHistory,
  offset: -1 | 1,
) {
  const index = history.index + offset;
  const entry = history.entries[index];
  return entry ? { history: { ...history, index }, ...entry } : null;
}

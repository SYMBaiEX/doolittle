import type { ComputerOrigin } from "../computer-origin";
import type { View } from "../desktop-navigation";

export interface DesktopNavigationHistory {
  readonly entries: readonly View[];
  readonly index: number;
  readonly computerOrigins?: Readonly<Record<number, ComputerOrigin>>;
}

export function createDesktopNavigationHistory(
  initialView: View,
): DesktopNavigationHistory {
  return { entries: [initialView], index: 0 };
}

export function pushDesktopNavigationHistory(
  history: DesktopNavigationHistory,
  view: View,
  computerOrigin?: ComputerOrigin,
): DesktopNavigationHistory {
  if (
    history.entries[history.index] === view &&
    JSON.stringify(history.computerOrigins?.[history.index]) ===
      JSON.stringify(computerOrigin)
  )
    return history;
  const index = history.index + 1;
  const computerOrigins =
    history.computerOrigins || computerOrigin
      ? Object.fromEntries(
          Object.entries(history.computerOrigins ?? {}).filter(
            ([key]) => Number(key) < index,
          ),
        )
      : undefined;
  if (computerOrigin && computerOrigins)
    computerOrigins[index] = { ...computerOrigin };
  return {
    entries: [...history.entries.slice(0, history.index + 1), view],
    index,
    ...(computerOrigins ? { computerOrigins } : {}),
  };
}

export function desktopNavigationTarget(
  history: DesktopNavigationHistory,
  offset: -1 | 1,
): {
  history: DesktopNavigationHistory;
  view: View;
  computerOrigin?: ComputerOrigin;
} | null {
  const index = history.index + offset;
  const view = history.entries[index];
  if (!view) return null;
  return {
    history: { ...history, index },
    view,
    ...(history.computerOrigins?.[index]
      ? { computerOrigin: { ...history.computerOrigins[index] } }
      : {}),
  };
}

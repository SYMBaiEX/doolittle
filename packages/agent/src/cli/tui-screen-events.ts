import { truncate } from "@/cli/text-utils";

interface ScreenEventTarget {
  width: number | string;
  height: number | string;
  render(): void;
  on(event: "resize" | "warning", handler: (value?: unknown) => void): void;
}

interface FocusEventTarget {
  on(event: "focus" | "click", handler: () => void): void;
}

interface TuiScreenEventsOptions {
  screen: ScreenEventTarget;
  minCols: number;
  minRows: number;
  appendActivity: (
    kind: string,
    message: string,
    tone: "info" | "success" | "warning" | "error" | "agent" | undefined,
  ) => void;
  syncLayout: () => void;
  scheduleRefreshPanels: (delayMs?: number) => void;
  noteWarningFooterHint: () => void;
  refreshPanels: () => Promise<void>;
  focusTrackedElements: FocusEventTarget[];
  textEntryElements: FocusEventTarget[];
  noteTextEntryActivity: () => void;
  updateFooterHint: () => void;
}

export function installTuiScreenEvents(options: TuiScreenEventsOptions): void {
  const {
    screen,
    minCols,
    minRows,
    appendActivity,
    syncLayout,
    scheduleRefreshPanels,
    noteWarningFooterHint,
    refreshPanels,
    focusTrackedElements,
    textEntryElements,
    noteTextEntryActivity,
    updateFooterHint,
  } = options;

  screen.on("resize", () => {
    if (
      (screen.width as number) < minCols ||
      (screen.height as number) < minRows
    ) {
      appendActivity(
        "warn",
        `Terminal too small (${screen.width as number}×${screen.height as number}). Resize to at least ${minCols}×${minRows}.`,
        "warning",
      );
      screen.render();
      return;
    }
    syncLayout();
    scheduleRefreshPanels(0);
  });

  screen.on("warning", (warning) => {
    appendActivity("warn", truncate(String(warning), 160), "warning");
    noteWarningFooterHint();
    void refreshPanels();
  });

  for (const element of focusTrackedElements) {
    element.on("focus", () => {
      if (textEntryElements.includes(element)) {
        noteTextEntryActivity();
      }
      updateFooterHint();
    });
    element.on("click", () => {
      if (textEntryElements.includes(element)) {
        noteTextEntryActivity();
      }
      updateFooterHint();
    });
  }
}

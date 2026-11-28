import blessed from "blessed";
import { terminalGlyph } from "./terminal-glyphs";
import { truncate } from "./text-utils";

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

type ResizeSurfaceState = "cockpit-visible" | "too-small-surface";

type ReadableTextEntry = blessed.Widgets.BlessedElement & {
  _reading?: boolean;
  readInput?: () => void;
};

interface HiddenCockpitElement {
  element: blessed.Widgets.BlessedElement;
  wasHidden: boolean;
}

const RESIZE_EPISODE_IDLE_MS = 500;

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

  const blessedScreen = screen as unknown as blessed.Widgets.Screen;
  const tooSmallSurface = blessed.box({
    parent: blessedScreen,
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    hidden: true,
    keyable: true,
    align: "center",
    valign: "middle",
    style: {
      fg: "yellow",
      bg: "black",
      bold: true,
    },
  });

  let surfaceState: ResizeSurfaceState = "cockpit-visible";
  let focusBeforeTooSmall: blessed.Widgets.BlessedElement | undefined;
  let textEntryToResume: ReadableTextEntry | undefined;
  let hiddenCockpitElements: HiddenCockpitElement[] = [];
  let resizeEpisodeTimer: NodeJS.Timeout | undefined;
  let tooSmallWarningEmitted = false;

  const terminalSize = (): { width: number; height: number } => ({
    width: Number(screen.width),
    height: Number(screen.height),
  });

  const tooSmallContent = (width: number, height: number): string => {
    const current = `Current ${width}x${height}`;
    const restore =
      width >= 44
        ? `${current} ${terminalGlyph("·", "|")} cockpit restores automatically`
        : current;
    return `Terminal too small\nResize to at least ${minCols}x${minRows}\n${restore}`;
  };

  const noteResizeEpisode = (): void => {
    if (resizeEpisodeTimer) {
      clearTimeout(resizeEpisodeTimer);
    }
    resizeEpisodeTimer = setTimeout(() => {
      resizeEpisodeTimer = undefined;
      tooSmallWarningEmitted = false;
    }, RESIZE_EPISODE_IDLE_MS);
    resizeEpisodeTimer.unref?.();
  };

  const appendTooSmallWarning = (width: number, height: number): void => {
    if (tooSmallWarningEmitted) return;
    tooSmallWarningEmitted = true;
    appendActivity(
      "warn",
      `Terminal too small (${width}${terminalGlyph("×", "x")}${height}). Resize to at least ${minCols}${terminalGlyph("×", "x")}${minRows}.`,
      "warning",
    );
  };

  const hideCockpitElements = (): void => {
    hiddenCockpitElements = [];
    for (const element of [
      ...(blessedScreen.children as unknown as blessed.Widgets.BlessedElement[]),
    ]) {
      if (element === tooSmallSurface) continue;
      hiddenCockpitElements.push({ element, wasHidden: element.hidden });
      element.hide();
    }
  };

  const restoreHiddenCockpitElements = (): void => {
    for (const { element, wasHidden } of hiddenCockpitElements) {
      if (!wasHidden) {
        element.show();
      }
    }
    hiddenCockpitElements = [];
  };

  const enterTooSmallSurface = (width: number, height: number): void => {
    const entering = surfaceState !== "too-small-surface";
    if (entering) {
      surfaceState = "too-small-surface";
      focusBeforeTooSmall = blessedScreen.focused;
      const focused = focusBeforeTooSmall as ReadableTextEntry | undefined;
      textEntryToResume =
        focused &&
        textEntryElements.includes(focused as FocusEventTarget) &&
        focused._reading === true
          ? focused
          : undefined;
    }

    tooSmallSurface.setContent(tooSmallContent(width, height));
    tooSmallSurface.show();
    tooSmallSurface.setFront();
    if (blessedScreen.focused !== tooSmallSurface) {
      tooSmallSurface.focus();
    }
    // Swallow ordinary cockpit shortcuts while their elements are hidden. The
    // warning surface deliberately has no key bindings; resize back above the
    // minimum to restore interaction.
    blessedScreen.grabKeys = true;
    if (entering) {
      hideCockpitElements();
    }
    screen.render();
  };

  const restoreCockpitSurface = (): boolean => {
    if (surfaceState === "cockpit-visible") return false;
    surfaceState = "cockpit-visible";
    tooSmallSurface.hide();
    restoreHiddenCockpitElements();
    blessedScreen.grabKeys = false;

    const focusTarget = focusBeforeTooSmall;
    const entryToResume = textEntryToResume;
    focusBeforeTooSmall = undefined;
    textEntryToResume = undefined;

    syncLayout();
    if (focusTarget && !focusTarget.detached && focusTarget.visible) {
      focusTarget.focus();
      if (entryToResume === focusTarget && entryToResume?._reading === false) {
        entryToResume.readInput?.();
      }
    }
    updateFooterHint();
    return true;
  };

  screen.on("resize", () => {
    const { width, height } = terminalSize();
    noteResizeEpisode();
    if (width < minCols || height < minRows) {
      appendTooSmallWarning(width, height);
      enterTooSmallSurface(width, height);
      return;
    }
    const restored = restoreCockpitSurface();
    if (!restored) {
      syncLayout();
    }
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

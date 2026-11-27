import {
  DEFAULT_TUI_THEME,
  type TuiThemeName,
} from "@doolittle/agent/runtime/theme-catalog";
import blessed from "blessed";
import { createWizardInputLock, installWizardScreenEvents } from "./events";
import { createWizardOverlay } from "./overlay";
import { createWizardPromptHandlers } from "./prompt-overlays";
import {
  buildWizardBaseFooter,
  buildWizardRenderModel,
  getThemeByName,
} from "./render";
import {
  appendWizardLogLine,
  cloneWizardSnapshot,
  createWizardSnapshot,
} from "./state";
import { applyWizardTheme, createThemePreviewRenderer } from "./theme";
import type { CreateWizardScreenOptions, WizardScreenContext } from "./types";
import { createWizardWidgets } from "./widgets";

export function createWizardScreen({
  initial,
  formatKeyLabel,
  onAbort,
}: CreateWizardScreenOptions): WizardScreenContext {
  const screen = blessed.screen({
    smartCSR: true,
    fullUnicode: true,
    title: "Doolittle // Awakening",
    dockBorders: true,
    grabKeys: true,
    mouse: true,
  });
  const snapshot = createWizardSnapshot(initial);
  const chromeTop = 4;
  const widgets = createWizardWidgets(
    screen,
    chromeTop,
    buildWizardBaseFooter(formatKeyLabel),
  );
  const tooSmallSurface = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    hidden: true,
    align: "center",
    valign: "middle",
    style: {
      fg: "yellow",
      bg: "black",
      bold: true,
    },
  });
  const inputLock = createWizardInputLock(screen);
  let activeThemeName = DEFAULT_TUI_THEME;

  const render = () => {
    const model = buildWizardRenderModel(
      snapshot,
      getThemeByName(activeThemeName),
      {
        cols: typeof screen.width === "number" ? screen.width : 0,
        rows: typeof screen.height === "number" ? screen.height : 0,
      },
    );
    widgets.header.setContent(model.headerContent);
    widgets.sidebar.setContent(model.sidebarContent);
    widgets.detail.setContent(model.detailContent);
    widgets.logBox.setContent(model.logContent);
    if (!model.tooSmall) {
      widgets.logBox.setScrollPerc(100);
    }
    if (model.tooSmall) {
      inputLock.setLocked(true);
      tooSmallSurface.setContent(model.detailContent);
      tooSmallSurface.show();
      tooSmallSurface.setFront();
      screen.program.hideCursor();
    } else {
      inputLock.setLocked(false);
      tooSmallSurface.hide();
      const focused = screen.focused as unknown as
        | { _reading?: boolean }
        | undefined;
      if (focused?._reading === true) {
        screen.program.showCursor();
      }
    }
    screen.render();
  };

  const setFooter = (content: string) => {
    widgets.footer.setContent(content);
    screen.render();
  };

  const applyPreviewTheme = createThemePreviewRenderer(widgets);
  applyWizardTheme(widgets, DEFAULT_TUI_THEME);

  const appendLine = (message: string) => {
    appendWizardLogLine(snapshot, message);
    render();
  };

  const setSection = (title: string, detailText?: string) => {
    snapshot.currentSection = title;
    snapshot.currentDetail = detailText || "";
    appendLine(`◆ ${title}${detailText ? ` — ${detailText}` : ""}`);
  };

  const showOverlay = <T>(
    title: string,
    body: string,
    mount: (
      box: blessed.Widgets.BoxElement,
      resolve: (value: T) => void,
    ) => void,
  ): Promise<T> =>
    // Chrome derives from the theme active when the overlay opens. During
    // the theme picker's live preview the frame keeps the opening theme
    // until the next overlay; the selection rows inside still follow the
    // preview because they derive at paint time.
    createWizardOverlay(
      screen,
      title,
      body,
      mount,
      () => {
        widgets.footer.setContent(buildWizardBaseFooter(formatKeyLabel));
        applyWizardTheme(widgets, activeThemeName);
        render();
      },
      getThemeByName(activeThemeName),
    );

  const promptHandlers = createWizardPromptHandlers({
    formatKeyLabel,
    getChromeTheme: () => getThemeByName(activeThemeName),
    render,
    setFooter,
    showOverlay,
    widgets,
  });

  installWizardScreenEvents(screen, {
    onResize: render,
    onWarning: (warning) => {
      appendLine(`WARNING: ${String(warning)}`);
    },
    onAbort: () => {
      onAbort?.();
    },
  });
  render();

  return {
    setSection,
    appendLine,
    ...promptHandlers,
    previewTheme: (theme: TuiThemeName) => {
      activeThemeName = theme;
      applyPreviewTheme(theme);
      render();
    },
    snapshot: () => cloneWizardSnapshot(snapshot),
    destroy: () => screen.destroy(),
  };
}

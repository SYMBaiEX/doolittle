import blessed from "blessed";
import {
  DEFAULT_TUI_THEME,
  type TuiThemeName,
} from "../../../packages/agent/src/runtime/theme-catalog";
import { installWizardScreenEvents } from "./events";
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
  WIZARD_SECTION_ORDER,
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
    widgets.sidebar.setContent(
      WIZARD_SECTION_ORDER.map((name) =>
        name === snapshot.currentSection
          ? `{bold}{${model.selectedTextColor}-fg}› ${name}{/}{/bold}`
          : `  ${name}`,
      ).join("\n"),
    );
    widgets.detail.setContent(model.detailContent);
    widgets.logBox.setContent(model.logContent);
    if (!model.tooSmall) {
      widgets.logBox.setScrollPerc(100);
    }
    screen.render();
  };

  const setFooter = (content: string) => {
    widgets.footer.setContent(content);
    screen.render();
  };

  const applyPreviewTheme = createThemePreviewRenderer(widgets, formatKeyLabel);
  applyWizardTheme(widgets, DEFAULT_TUI_THEME, formatKeyLabel);

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
    createWizardOverlay(screen, title, body, mount, () => {
      applyWizardTheme(widgets, activeThemeName, formatKeyLabel);
      render();
    });

  const promptHandlers = createWizardPromptHandlers({
    formatKeyLabel,
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

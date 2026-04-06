import { describe, expect, it } from "bun:test";
import type { AppContext } from "@/runtime/bootstrap";
import { getTuiTheme } from "@/runtime/theme-catalog";
import type { TuiStateStore } from "../../tui-state";
import { createTuiStartPresentation } from "./presentation";

function createElement(initialContent = "") {
  let content = initialContent;
  let label = "";
  return {
    style: {
      border: {},
      label: {},
      focus: {},
      selected: {},
      item: {},
    },
    setContent(next: string) {
      content = next;
    },
    getContent() {
      return content;
    },
    setLabel(next: string) {
      label = next;
    },
    getLabel() {
      return label;
    },
    getValue() {
      return "hello";
    },
    focus() {},
    scroll() {},
  };
}

describe("createTuiStartPresentation", () => {
  it("renders theme-aware panels and updates layout state", async () => {
    const activity = createElement();
    const response = createElement();
    const sidebar = createElement();
    const transportBox = createElement();
    const executionBox = createElement();
    const assistBox = createElement();
    const paletteOverlay = createElement();
    const paletteInput = createElement();
    const paletteList = createElement();
    const composerOverlay = createElement();
    const composer = createElement();
    const inputBox = createElement();
    const footer = createElement();
    let renderCalls = 0;
    const screen = {
      render() {
        renderCalls += 1;
      },
      focused: inputBox,
    };

    const activeTheme = getTuiTheme("ember");
    const nextTheme = getTuiTheme("synthwave");
    let currentTheme = activeTheme;
    const appliedThemes: string[] = [];
    const appContext = {
      config: {
        agentName: "doolittle",
        workspaceDir: "/workspace",
      },
      services: {
        settings: {
          get() {
            return {
              model: {
                model: "anthropic/claude-3.5",
              },
              agent: {
                runDepth: "standard",
                maxIterations: 45,
                toolProgressMode: "new",
              },
              ui: {
                theme: "synthwave",
              },
            };
          },
        },
      },
    } as unknown as AppContext;
    const tuiState = {
      busy: false,
      queueDepth: 0,
      opsCollapsed: false,
      paletteOpen: false,
      composerOpen: false,
      controlDeckMode: "assist",
    } as unknown as TuiStateStore;

    const presentation = createTuiStartPresentation({
      context: appContext,
      state: { activeSessionId: "session-1", notices: [] } as never,
      screen: screen as never,
      widgets: {
        header: createElement(),
        activity,
        response,
        sidebar,
        transportBox,
        executionBox,
        assistBox,
        paletteOverlay,
        paletteInput,
        paletteList,
        composerOverlay,
        composer,
        inputBox,
        footer,
      } as never,
      tuiState,
      logger: {
        child() {
          return {
            debug() {},
            info() {},
            warn() {},
            error() {},
            trace() {},
          };
        },
      } as never,
      getActiveTheme: () => currentTheme,
      setActiveTheme: (theme) => {
        currentTheme = theme;
        appliedThemes.push(theme.name);
      },
      appendActivity: () => {},
      flushDeferredForeignActivity: () => {},
      truncate: (text) => text,
    });

    expect(presentation.renderFooterContent()).toContain("Esc input");
    presentation.setFooterHint("Heads up");
    expect(presentation.renderFooterContent()).toContain("Heads up");
    presentation.syncLayout();
    expect(renderCalls).toBeGreaterThan(0);
    await presentation.syncThemeFromSettings();
    expect(appliedThemes).toEqual(["synthwave"]);
    expect(currentTheme).toBe(nextTheme);
  });
});

import type blessed from "blessed";
import { escapeBlessed } from "@/cli/render-utils";
import {
  appendCliTrace,
  formatRecoverableProviderError,
} from "@/cli/runtime-errors";
import type { AppLogger } from "@/logging/logger";

interface TuiPanelsOptions {
  logger: AppLogger;
  screen: blessed.Widgets.Screen;
  sidebar: { setContent(content: string): void };
  transportBox: { hidden: boolean; setContent(content: string): void };
  executionBox: { hidden: boolean; setContent(content: string): void };
  assistBox: { setContent(content: string): void };
  footer: { setContent(content: string): void };
  renderStatusRail: () => string;
  renderTransportPanel: () => Promise<string>;
  renderExecutionPanel: () => Promise<string>;
  renderControlDeck: () => Promise<void>;
  renderFooterContent: () => string;
  appendActivity: (
    kind: string,
    message: string,
    tone: "info" | "success" | "warning" | "error" | "agent" | undefined,
  ) => void;
}

interface TuiPanelsController {
  refreshPanels(): Promise<void>;
  scheduleRefreshPanels(delayMs?: number): void;
}

export function installTuiPanels(
  options: TuiPanelsOptions,
): TuiPanelsController {
  const {
    logger,
    screen,
    sidebar,
    transportBox,
    executionBox,
    assistBox,
    footer,
    renderStatusRail,
    renderTransportPanel,
    renderExecutionPanel,
    renderControlDeck,
    renderFooterContent,
    appendActivity,
  } = options;
  let lastPanelFailureSignature = "";
  let refreshPanelsPromise: Promise<void> | null = null;
  let refreshPanelsQueued = false;
  let refreshPanelsTimer: ReturnType<typeof setTimeout> | null = null;

  const notePanelFailure = (panel: string, error: unknown): void => {
    const detail = formatRecoverableProviderError(error);
    const signature = `${panel}:${detail}`;
    if (signature === lastPanelFailureSignature) {
      return;
    }
    lastPanelFailureSignature = signature;
    appendActivity(panel, detail, "warning");
  };

  const refreshPanels = async (): Promise<void> => {
    appendCliTrace(logger, "tui:refreshPanels:start");
    try {
      sidebar.setContent(renderStatusRail());
    } catch (error) {
      notePanelFailure("status", error);
      sidebar.setContent(
        `{bold}Session Rail{/}\n{yellow-fg}Status temporarily unavailable{/}\n\n${escapeBlessed(formatRecoverableProviderError(error))}`,
      );
    }
    if (!transportBox.hidden) {
      try {
        transportBox.setContent(await renderTransportPanel());
      } catch (error) {
        notePanelFailure("channels", error);
        transportBox.setContent(
          `{bold}Channels{/}\n{yellow-fg}Transport state unavailable{/}\n\n${escapeBlessed(formatRecoverableProviderError(error))}`,
        );
      }
    }
    if (!executionBox.hidden) {
      try {
        executionBox.setContent(await renderExecutionPanel());
      } catch (error) {
        notePanelFailure("workbench", error);
        executionBox.setContent(
          `{bold}Workbench{/}\n{yellow-fg}Execution state unavailable{/}\n\n${escapeBlessed(formatRecoverableProviderError(error))}`,
        );
      }
    }
    try {
      await renderControlDeck();
    } catch (error) {
      notePanelFailure("launchpad", error);
      assistBox.setContent(
        `{bold}Launchpad{/}\n{yellow-fg}Control deck unavailable{/}\n\n${escapeBlessed(formatRecoverableProviderError(error))}`,
      );
    }
    footer.setContent(renderFooterContent());
    screen.render();
    appendCliTrace(
      logger,
      "tui:refreshPanels:rendered",
      `renders=${String((screen as blessed.Widgets.Screen & { renders?: number }).renders ?? "n/a")} width=${String(screen.width)} height=${String(screen.height)}`,
    );
  };

  const scheduleRefreshPanels = (delayMs = 120): void => {
    refreshPanelsQueued = true;
    if (refreshPanelsTimer) {
      return;
    }
    refreshPanelsTimer = setTimeout(() => {
      refreshPanelsTimer = null;
      if (refreshPanelsPromise) {
        return;
      }
      refreshPanelsPromise = (async () => {
        do {
          refreshPanelsQueued = false;
          await refreshPanels();
        } while (refreshPanelsQueued);
      })().finally(() => {
        refreshPanelsPromise = null;
        if (refreshPanelsQueued && !refreshPanelsTimer) {
          scheduleRefreshPanels(delayMs);
        }
      });
    }, delayMs);
  };

  return {
    refreshPanels,
    scheduleRefreshPanels,
  };
}

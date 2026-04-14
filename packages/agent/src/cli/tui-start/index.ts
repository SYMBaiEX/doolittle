import { mkdirSync } from "node:fs";
import { platform } from "node:os";
import { join } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import blessed from "blessed";
import {
  buildCockpitBootMessage,
  buildCockpitTipMessage,
  buildCockpitWelcomeMessage,
} from "@/cli/cockpit-chrome";
import { type CliState, createCliSessionId } from "@/cli/execution";
import {
  appendCliTrace,
  formatRecoverableProviderError,
  isBenignCliShutdownError,
  isRecoverableProviderError,
} from "@/cli/runtime-errors";
import { truncate } from "@/cli/text-utils";
import { createBlessedOutputProxy } from "@/cli/tui-output-proxy";
import {
  runTuiBootSequence,
  scheduleTuiDeferredHydration,
  waitForTuiDestroy,
} from "@/cli/tui-runtime-shell";
import { createTuiState } from "@/cli/tui-state";
import { createTuiWidgets } from "@/cli/tui-widget-factory";
import type { AppContext } from "@/runtime/bootstrap";
import { getTuiTheme } from "@/runtime/theme-catalog";
import { assembleTuiStartRuntime } from "./assembly";

import type { StartCliOptions } from "./types";

export type { StartCliOptions } from "./types";

const IS_MACOS = platform() === "darwin";

function isConversationalInput(text: string): boolean {
  const trimmed = text.trim();
  return !!trimmed && !trimmed.startsWith("/") && !trimmed.startsWith("!");
}

export async function startTui(
  context: AppContext,
  options?: StartCliOptions,
): Promise<number | "unexpected" | "too-small"> {
  const tuiLogger = context.services.logger.child("cli.tui");
  const state: CliState = {
    activeSessionId: createCliSessionId("cli"),
    notices: [],
  };
  let activeTheme = getTuiTheme(context.services.settings.get().ui.theme);
  const tuiOutput = createBlessedOutputProxy(output);
  const screen = blessed.screen({
    input,
    output: tuiOutput,
    smartCSR: true,
    fullUnicode: true,
    title: `${context.config.agentName} TUI`,
    dockBorders: true,
  });
  const tuiWidgets = createTuiWidgets({
    screen,
    theme: activeTheme,
    agentName: context.config.agentName,
  });

  const MIN_COLS = 80;
  const MIN_ROWS = 24;

  if (
    (screen.width as number) < MIN_COLS ||
    (screen.height as number) < MIN_ROWS
  ) {
    screen.destroy();
    output.write(
      `Terminal too small (${screen.width as number}×${screen.height as number}). ` +
        `Minimum required: ${MIN_COLS}×${MIN_ROWS}. Falling back to plain CLI.\n`,
    );
    return "too-small";
  }

  const crashLogPath = tuiLogger.getCrashLogPath();
  mkdirSync(context.config.dataDir, { recursive: true });
  appendCliTrace(tuiLogger, "tui:start");
  const transcriptExportPath = join(
    context.config.dataDir,
    "latest-transcript.txt",
  );
  const focusables: blessed.Widgets.BlessedElement[] = [
    tuiWidgets.activity,
    tuiWidgets.response,
    tuiWidgets.sidebar,
    tuiWidgets.assistBox,
    tuiWidgets.inputBox,
  ];
  const {
    state: tuiState,
    lifecycleState: tuiLifecycleState,
    queueState,
    overlayState,
  } = createTuiState({
    initialFocusIndex: focusables.length - 1,
  });
  const tuiAssembly = assembleTuiStartRuntime({
    context,
    state,
    logger: tuiLogger,
    screen,
    output,
    crashLogPath,
    transcriptExportPath,
    widgets: tuiWidgets,
    focusables,
    tuiState,
    lifecycleState: tuiLifecycleState,
    queueState,
    overlayState,
    getActiveTheme: () => activeTheme,
    setActiveTheme: (theme) => {
      activeTheme = theme;
    },
    isConversationalInput,
    truncate,
    canCopyToClipboard: IS_MACOS,
  });

  await runTuiBootSequence({
    bootMessage: buildCockpitBootMessage(context.config.agentName),
    tipMessage: buildCockpitTipMessage(),
    welcomeBody: buildCockpitWelcomeMessage(),
    bootLogs: (options?.bootLogs ?? []).map((entry) => ({
      source: entry.source,
      text: truncate(entry.text, 180),
    })),
    appendActivity: tuiAssembly.appendActivity,
    pushResponseEntry: tuiAssembly.pushResponseEntry,
    transportBox: tuiWidgets.transportBox,
    executionBox: tuiWidgets.executionBox,
    renderTransportPanel: tuiAssembly.renderTransportPanel,
    renderExecutionPanel: tuiAssembly.renderExecutionPanel,
    renderCurrentControlDeck: tuiAssembly.renderCurrentControlDeck,
    applyTheme: tuiAssembly.applyTheme,
    appendTrace: (label, detail) => {
      appendCliTrace(tuiLogger.child("boot"), label, detail);
    },
    refreshPanels: tuiAssembly.refreshPanels,
    syncLayout: tuiAssembly.syncLayout,
    activatePrimaryInput: tuiAssembly.activatePrimaryInput,
    updateFooterHint: tuiAssembly.updateFooterHint,
    screen,
    onReady: options?.onReady,
  });
  scheduleTuiDeferredHydration({
    context,
    isScreenDestroyed: () => tuiState.screenDestroyed,
    isBenignShutdownError: isBenignCliShutdownError,
    isRecoverableProviderError,
    formatRecoverableProviderError: (error) =>
      truncate(formatRecoverableProviderError(error), 180),
    logFatal: tuiAssembly.logFatal,
    appendActivity: tuiAssembly.appendActivity,
    pushNotice: tuiAssembly.pushNotice,
    scheduleRefreshPanels: tuiAssembly.scheduleRefreshPanels,
  });

  return await waitForTuiDestroy({
    screen,
    markScreenDestroyed: () => {
      tuiState.screenDestroyed = true;
    },
    cleanup: tuiAssembly.dispose,
    isShuttingDown: () => tuiState.shuttingDown,
    getExitCode: () => tuiState.requestedExitCode,
    onUnexpectedDestroy: () => {
      tuiLogger.recordCrash(
        "unexpected-screen-destroy",
        "TUI screen destroyed before an explicit shutdown path.",
      );
    },
  });
}

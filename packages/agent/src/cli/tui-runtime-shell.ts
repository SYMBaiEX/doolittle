import type blessed from "blessed";
import type { AppContext } from "@/runtime/bootstrap";

interface DeferredHydrationOptions {
  context: AppContext;
  isScreenDestroyed: () => boolean;
  isBenignShutdownError: (error: unknown) => boolean;
  isRecoverableProviderError: (error: unknown) => boolean;
  formatRecoverableProviderError: (error: unknown) => string;
  logFatal: (label: string, error: unknown) => void;
  appendActivity: (
    kind: string,
    message: string,
    tone: "info" | "success" | "warning" | "error" | "agent" | undefined,
  ) => void;
  pushNotice: (kind: "context" | "skills" | "status", message: string) => void;
  scheduleRefreshPanels: (delayMs?: number) => void;
}

interface WaitForTuiDestroyOptions {
  screen: blessed.Widgets.Screen;
  markScreenDestroyed: () => void;
  cleanup: () => void;
  isShuttingDown: () => boolean;
  getExitCode: () => number;
  onUnexpectedDestroy: () => void;
}

interface TuiBootLogEntry {
  source: "stdout" | "stderr";
  text: string;
}

interface RunTuiBootSequenceOptions {
  bootMessage: string;
  tipMessage: string;
  welcomeBody: string;
  bootLogs?: TuiBootLogEntry[];
  appendActivity: (
    kind: string,
    message: string,
    tone: "info" | "success" | "warning" | "error" | "agent" | undefined,
  ) => void;
  pushResponseEntry: (label: string, body: string) => void;
  transportBox: { hidden: boolean; setContent(content: string): void };
  executionBox: { hidden: boolean; setContent(content: string): void };
  renderTransportPanel: () => Promise<string>;
  renderExecutionPanel: () => Promise<string>;
  renderCurrentControlDeck: () => Promise<void>;
  applyTheme: () => void;
  appendTrace: (label: string, detail?: string) => void;
  refreshPanels: () => Promise<void>;
  syncLayout: () => void;
  activatePrimaryInput: () => void;
  updateFooterHint: () => void;
  screen: blessed.Widgets.Screen;
  onReady?: () => void;
}

export function scheduleTuiDeferredHydration(
  options: DeferredHydrationOptions,
): void {
  const {
    context,
    isScreenDestroyed,
    isBenignShutdownError,
    isRecoverableProviderError,
    formatRecoverableProviderError,
    logFatal,
    appendActivity,
    pushNotice,
    scheduleRefreshPanels,
  } = options;

  setTimeout(() => {
    void context.ensureDeferredHydration("tui").catch((error) => {
      if (isScreenDestroyed() && isBenignShutdownError(error)) {
        return;
      }
      if (isRecoverableProviderError(error)) {
        logFatal("recoverableDeferredHydration", error);
        appendActivity(
          "startup",
          formatRecoverableProviderError(error),
          "warning",
        );
        pushNotice(
          "status",
          `Deferred startup hit a recoverable error: ${formatRecoverableProviderError(error)}`,
        );
        scheduleRefreshPanels(0);
        return;
      }
      logFatal("deferredHydrationFailure", error);
      appendActivity("startup", formatRecoverableProviderError(error), "error");
      pushNotice(
        "status",
        `Deferred startup failed: ${formatRecoverableProviderError(error)}`,
      );
      scheduleRefreshPanels(0);
    });
  }, 25).unref?.();
}

export async function runTuiBootSequence(
  options: RunTuiBootSequenceOptions,
): Promise<void> {
  const {
    bootMessage,
    tipMessage,
    welcomeBody,
    bootLogs,
    appendActivity,
    pushResponseEntry,
    transportBox,
    executionBox,
    renderTransportPanel,
    renderExecutionPanel,
    renderCurrentControlDeck,
    applyTheme,
    appendTrace,
    refreshPanels,
    syncLayout,
    activatePrimaryInput,
    updateFooterHint,
    screen,
    onReady,
  } = options;

  appendActivity("boot", bootMessage, "success");
  appendActivity("tip", tipMessage, "info");
  for (const entry of bootLogs ?? []) {
    appendActivity(
      entry.source === "stderr" ? "boot!" : "boot+",
      entry.text,
      entry.source === "stderr" ? "warning" : "info",
    );
  }
  pushResponseEntry("Helm Ready", welcomeBody);
  if (!transportBox.hidden) {
    transportBox.setContent(await renderTransportPanel());
  }
  if (!executionBox.hidden) {
    executionBox.setContent(await renderExecutionPanel());
  }
  await renderCurrentControlDeck();

  applyTheme();
  appendTrace("tui:before-refresh");
  await refreshPanels();
  appendTrace("tui:after-refresh");
  syncLayout();
  appendTrace("tui:after-layout");
  activatePrimaryInput();
  updateFooterHint();
  screen.render();
  appendTrace(
    "tui:after-final-render",
    `renders=${String((screen as blessed.Widgets.Screen & { renders?: number }).renders ?? "n/a")} focused=${screen.focused?.type ?? "none"}`,
  );
  onReady?.();
}

export function waitForTuiDestroy(
  options: WaitForTuiDestroyOptions,
): Promise<number | "unexpected"> {
  const {
    screen,
    markScreenDestroyed,
    cleanup,
    isShuttingDown,
    getExitCode,
    onUnexpectedDestroy,
  } = options;

  return new Promise<number | "unexpected">((resolve) => {
    const tuiKeepAlive = setInterval(() => {}, 60_000);
    screen.on("destroy", () => {
      clearInterval(tuiKeepAlive);
      markScreenDestroyed();
      cleanup();
      if (!isShuttingDown()) {
        onUnexpectedDestroy();
      }
      resolve(isShuttingDown() ? getExitCode() : "unexpected");
    });
  });
}

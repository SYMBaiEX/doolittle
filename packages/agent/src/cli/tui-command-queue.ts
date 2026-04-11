import type {
  CliExecutionHooks,
  CliExecutionResult,
  CliState,
} from "@/cli/execution";
import { currentSessionElapsed } from "@/cli/shell-chrome";
import { compactPreview } from "@/cli/text-utils";
import type { ResponseTranscriptEntry } from "@/cli/transcript-renderer";
import type { AppLogger } from "@/logging/logger";
import type { AppContext } from "@/runtime/bootstrap";

export interface TuiCommandQueueState {
  busy: boolean;
  queueDepth: number;
  activeTurnAbortController: AbortController | null;
  exitAfterTurnCancellation: boolean;
  requestedExitCode: number;
  screenDestroyed: boolean;
}

interface TuiCommandQueueOptions {
  context: AppContext;
  state: CliState;
  logger: AppLogger;
  queueState: TuiCommandQueueState;
  executeInput: (
    line: string,
    context: AppContext,
    state: CliState,
    hooks?: CliExecutionHooks,
  ) => Promise<CliExecutionResult>;
  isConversationalInput: (text: string) => boolean;
  appendActivity: (
    kind: string,
    message: string,
    tone: CliExecutionResult["tone"],
  ) => void;
  getLiveResponse: () => ResponseTranscriptEntry | undefined;
  setLiveResponse: (
    label: string,
    body: string,
    options?: { kind?: ResponseTranscriptEntry["kind"]; pending?: boolean },
  ) => void;
  pushResponseEntry: (
    label: string,
    body: string,
    options?: { elapsed?: string },
  ) => void;
  pushNotice: (kind: "context" | "skills" | "status", message: string) => void;
  scheduleRefreshPanels: (delayMs?: number) => void;
  syncThemeFromSettings: () => Promise<void>;
  startBusySpinner: () => void;
  stopBusySpinner: () => void;
  focusProcessingSurface: () => void;
  refreshPanels: () => Promise<void>;
  flushDeferredForeignActivity: () => void;
  resetInputAfterQueue: () => void;
  restoreInputAfterRun: () => Promise<void>;
  handleEmptyQueueSubmit: () => void;
  onRecoveryFailure: (error: unknown) => void;
  destroyScreen: () => void;
  requestExit: (exitCode?: number) => void;
}

interface TuiCommandQueueController {
  queueCommand(line: string): void;
  historyBack(): string | undefined;
  historyForward(): string | undefined;
  hasHistory(): boolean;
}

export function installTuiCommandQueue(
  options: TuiCommandQueueOptions,
): TuiCommandQueueController {
  const {
    context,
    state,
    logger,
    queueState,
    executeInput,
    isConversationalInput,
    appendActivity,
    getLiveResponse,
    setLiveResponse,
    pushResponseEntry,
    pushNotice,
    scheduleRefreshPanels,
    syncThemeFromSettings,
    startBusySpinner,
    stopBusySpinner,
    focusProcessingSurface,
    refreshPanels,
    flushDeferredForeignActivity,
    resetInputAfterQueue,
    restoreInputAfterRun,
    handleEmptyQueueSubmit,
    onRecoveryFailure,
    destroyScreen,
    requestExit,
  } = options;
  const commandHistory: string[] = [];
  const pendingCommands: string[] = [];
  let historyIndex = 0;

  const processQueue = async (): Promise<void> => {
    if (queueState.busy || pendingCommands.length === 0) {
      return;
    }

    queueState.busy = true;
    startBusySpinner();
    focusProcessingSurface();
    queueState.queueDepth = pendingCommands.length;
    await refreshPanels();

    const line = pendingCommands.shift();
    queueState.queueDepth = pendingCommands.length;

    if (!line) {
      queueState.busy = false;
      await refreshPanels();
      return;
    }

    const isShellCommand = line.startsWith("!");
    appendActivity("cmd", line, "info");
    setLiveResponse(
      isConversationalInput(line)
        ? context.config.agentName
        : isShellCommand
          ? "Shell"
          : "Command Result",
      "",
      {
        kind: isConversationalInput(line)
          ? "assistant"
          : isShellCommand
            ? "shell"
            : "command",
        pending: true,
      },
    );

    try {
      queueState.activeTurnAbortController = new AbortController();
      const result = await executeInput(line, context, state, {
        abortSignal: queueState.activeTurnAbortController.signal,
        onStream: ({ source, chunk, command }) => {
          const lines = chunk
            .split(/\r?\n/gu)
            .map((entry) => entry.trim())
            .filter(Boolean);
          if (!lines.length) {
            return;
          }
          for (const lineChunk of lines) {
            if (!isShellCommand) {
              appendActivity(
                source === "stdout" ? "out+" : "err+",
                `${command}: ${lineChunk}`,
                source === "stdout" ? "agent" : "warning",
              );
            }
          }
          const streamed = lines.join("\n");
          const current = getLiveResponse()?.body ?? "";
          setLiveResponse(
            `Running ${command}`,
            current.trim()
              ? `${current}\n${source.toUpperCase()}: ${streamed}`
              : `${source.toUpperCase()}: ${streamed}`,
            { kind: "shell", pending: true },
          );
        },
        onResponseProgress: ({ response }) => {
          setLiveResponse(
            isConversationalInput(line)
              ? context.config.agentName
              : isShellCommand
                ? "Shell"
                : "Command Result",
            response,
            {
              kind: isConversationalInput(line)
                ? "assistant"
                : isShellCommand
                  ? "shell"
                  : "command",
              pending: true,
            },
          );
        },
        onNotice: ({ kind, message }) => {
          pushNotice(kind, message);
          scheduleRefreshPanels(0);
        },
      });
      await syncThemeFromSettings();
      if (result.text) {
        const label =
          result.tone === "agent"
            ? context.config.agentName
            : isShellCommand
              ? "Shell"
              : line.startsWith("/")
                ? "Command Result"
                : context.config.agentName;
        pushResponseEntry(label, result.text, {
          elapsed: currentSessionElapsed(context, state.activeSessionId),
        });
        if (result.tone !== "agent") {
          appendActivity("out", compactPreview(result.text), result.tone);
        }
      }
      if (result.shouldExit) {
        destroyScreen();
        return;
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      logger.captureError("command-error", error, { command: line });
      pushResponseEntry(line, `Error: ${detail}`, {
        elapsed: currentSessionElapsed(context, state.activeSessionId),
      });
      appendActivity("err", detail, "error");
    } finally {
      queueState.activeTurnAbortController = null;
      queueState.busy = false;
      stopBusySpinner();
      const shouldExitAfterRun = queueState.exitAfterTurnCancellation;
      queueState.exitAfterTurnCancellation = false;
      if (!queueState.screenDestroyed && !shouldExitAfterRun) {
        let recoveryFailed = false;
        try {
          flushDeferredForeignActivity();
          await restoreInputAfterRun();
        } catch (error) {
          recoveryFailed = true;
          onRecoveryFailure(error);
        }
        if (!recoveryFailed) {
          void processQueue();
        }
      }
      if (shouldExitAfterRun) {
        requestExit(queueState.requestedExitCode || 130);
      }
    }
  };

  return {
    queueCommand(line) {
      const trimmed = line.trim();
      if (!trimmed) {
        handleEmptyQueueSubmit();
        return;
      }

      if (
        commandHistory.length === 0 ||
        commandHistory[commandHistory.length - 1] !== trimmed
      ) {
        commandHistory.push(trimmed);
      }
      historyIndex = commandHistory.length;
      if (isConversationalInput(trimmed)) {
        pushResponseEntry("You", trimmed);
      } else if (trimmed.startsWith("!")) {
        pushResponseEntry("Shell", trimmed);
      } else if (trimmed.startsWith("/")) {
        pushResponseEntry("Command", trimmed);
      }
      pendingCommands.push(trimmed);
      queueState.queueDepth = pendingCommands.length;
      resetInputAfterQueue();
      void processQueue();
    },
    historyBack() {
      if (!commandHistory.length) {
        return undefined;
      }
      historyIndex = Math.max(0, historyIndex - 1);
      return commandHistory[historyIndex] ?? "";
    },
    historyForward() {
      if (!commandHistory.length) {
        return undefined;
      }
      historyIndex = Math.min(commandHistory.length, historyIndex + 1);
      return commandHistory[historyIndex] ?? "";
    },
    hasHistory() {
      return commandHistory.length > 0;
    },
  };
}

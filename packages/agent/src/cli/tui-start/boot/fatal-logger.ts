import type { CliExecutionResult } from "@/cli/execution";
import type { AppLogger } from "@/logging/logger";
import type { TuiStateStore } from "../../tui-state";

export function createTuiStartFatalLogger(options: {
  logger: AppLogger;
  output: NodeJS.WriteStream;
  crashLogPath: string;
  tuiState: TuiStateStore;
  appendActivity: (
    kind: string,
    message: string,
    tone: CliExecutionResult["tone"],
  ) => void;
  pushResponseEntry: (
    label: string,
    body: string,
    options?: { elapsed?: string },
  ) => void;
  truncate: (text: string, maxLength: number) => string;
}): (label: string, error: unknown) => void {
  const {
    logger,
    output,
    crashLogPath,
    tuiState,
    appendActivity,
    pushResponseEntry,
    truncate,
  } = options;

  return (label: string, error: unknown): void => {
    const detail = logger.captureError(label, error);
    if (!tuiState.screenDestroyed) {
      pushResponseEntry(label, `Error: ${detail}`);
      appendActivity("err", truncate(detail, 260), "error");
      return;
    }
    output.write(`\n${label}: ${detail}\nCrash log: ${crashLogPath}\n`);
  };
}

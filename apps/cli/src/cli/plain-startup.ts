import type { AppLogger } from "@doolittle/agent/logging/logger";
import type { AppContext } from "@doolittle/agent/runtime/bootstrap";
import type { CliState } from "./execution/index";
import { formatRecoverableProviderError } from "./runtime-errors";
import {
  renderPlainBanner,
  renderPlainRunLine,
  renderPlainShellHints,
} from "./shell-chrome";

const MAX_ACTIONABLE_BOOT_LOGS = 4;
const ACTIONABLE_BOOT_LOG_PATTERN =
  /\b(?:warn(?:ing)?|error|fatal|failed|failure|unavailable|missing|cannot|unable|not set)\b/iu;

function isActionableBootLog(entry: {
  source: "stdout" | "stderr";
  text: string;
}): boolean {
  return ACTIONABLE_BOOT_LOG_PATTERN.test(entry.text);
}

interface PlainStartupOptions {
  context: AppContext;
  state: CliState;
  output: NodeJS.WriteStream;
  interactiveShell: boolean;
  bootLogs?: Array<{ source: "stdout" | "stderr"; text: string }>;
  onReady?: () => void;
}

interface PlainDeferredHydrationOptions {
  context: AppContext;
  output: NodeJS.WriteStream;
  logger: AppLogger;
  shouldRun: boolean;
  handleRecoverableRuntimeError: (error: unknown) => boolean;
  delayMs?: number;
}

export function renderPlainStartup(options: PlainStartupOptions): void {
  const { context, state, output, interactiveShell, bootLogs, onReady } =
    options;
  if (interactiveShell) {
    output.write(`${renderPlainBanner(context, state)}\n`);
    output.write(`${renderPlainShellHints(context, state)}\n\n`);
    const actionableBootLogs = (bootLogs ?? [])
      .filter(isActionableBootLog)
      .slice(0, MAX_ACTIONABLE_BOOT_LOGS);
    for (const entry of actionableBootLogs) {
      output.write(
        `${renderPlainRunLine(`boot ${entry.source === "stderr" ? "warn" : "info"} · ${entry.text}`, "[boot]")}\n`,
      );
    }
    if (actionableBootLogs.length > 0) {
      output.write("\n");
    }
    onReady?.();
  }
}

export function schedulePlainDeferredHydration(
  options: PlainDeferredHydrationOptions,
): void {
  const {
    context,
    output,
    logger,
    shouldRun,
    handleRecoverableRuntimeError,
    delayMs = 25,
  } = options;
  if (!shouldRun) {
    return;
  }
  setTimeout(() => {
    void context.ensureDeferredHydration("plain-cli").catch((error) => {
      if (handleRecoverableRuntimeError(error)) {
        return;
      }
      logger.captureError("plain-cli-deferred-hydration", error);
      output.write(
        `\nDeferred startup failed: ${formatRecoverableProviderError(error)}\n\n`,
      );
    });
  }, delayMs).unref?.();
}

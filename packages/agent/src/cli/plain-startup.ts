import type { CliState } from "@/cli/execution";
import { formatRecoverableProviderError } from "@/cli/runtime-errors";
import {
  renderPlainBanner,
  renderPlainRunLine,
  renderPlainShellHints,
} from "@/cli/shell-chrome";
import type { AppLogger } from "@/logging/logger";
import type { AppContext } from "@/runtime/bootstrap";

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
    for (const entry of bootLogs ?? []) {
      output.write(
        `${renderPlainRunLine(`boot ${entry.source === "stderr" ? "warn" : "info"} · ${entry.text}`, "[boot]")}\n`,
      );
    }
    if ((bootLogs?.length ?? 0) > 0) {
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

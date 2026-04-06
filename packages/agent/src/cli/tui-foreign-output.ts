import { sanitizeTerminalText } from "@/cli/render-utils";
import { appendCliTrace } from "@/cli/runtime-errors";
import {
  formatForeignTerminalArgs,
  shouldDeferForeignOutput,
  shouldSuppressForeignTerminalLine,
} from "@/cli/tui-foreign-output-routing";
import type { AppLogger } from "@/logging/logger";

interface TuiForeignOutputOptions {
  logger: AppLogger;
  isScreenDestroyed: () => boolean;
  isShuttingDown: () => boolean;
  routeForeignActivity: (
    source: "stdout" | "stderr" | "console",
    text: string,
  ) => void;
  flushDeferredForeignActivity: () => void;
  scheduleDeferredForeignRefresh: (delayMs?: number) => void;
  scheduleRefreshPanels: (delayMs?: number) => void;
  textEntryFocused: () => boolean;
  overlaysOpen: () => boolean;
}

function sanitizeForeignTerminalWrite(text: string): string {
  return sanitizeTerminalText(text);
}

export function installTuiForeignOutput(
  options: TuiForeignOutputOptions,
): () => void {
  const {
    logger,
    isScreenDestroyed,
    isShuttingDown,
    routeForeignActivity,
    flushDeferredForeignActivity,
    scheduleDeferredForeignRefresh,
    scheduleRefreshPanels,
    textEntryFocused,
    overlaysOpen,
  } = options;
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  const originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };
  let stdoutBuffer = "";
  let stderrBuffer = "";

  const flushBuffer = (source: "stdout" | "stderr") => {
    const pending = source === "stdout" ? stdoutBuffer : stderrBuffer;
    const sanitized = sanitizeForeignTerminalWrite(pending);
    if (sanitized) {
      routeForeignActivity(source, sanitized);
    }
    if (source === "stdout") {
      stdoutBuffer = "";
    } else {
      stderrBuffer = "";
    }
  };

  const interceptWrite =
    (source: "stdout" | "stderr", original: typeof process.stdout.write) =>
    (
      chunk: string | Uint8Array,
      encoding?: BufferEncoding | ((error?: Error | null) => void),
      callback?: (error?: Error | null) => void,
    ): boolean => {
      if (isScreenDestroyed() || isShuttingDown()) {
        return original(chunk as never, encoding as never, callback);
      }

      const text =
        typeof chunk === "string"
          ? chunk
          : Buffer.from(chunk).toString(
              typeof encoding === "string" ? encoding : "utf8",
            );
      const sanitized = sanitizeForeignTerminalWrite(text);

      if (!sanitized) {
        if (typeof encoding === "function") {
          encoding();
        }
        callback?.();
        return true;
      }

      if (source === "stdout") {
        stdoutBuffer += `${sanitized}\n`;
      } else {
        stderrBuffer += `${sanitized}\n`;
      }

      const lines = (source === "stdout" ? stdoutBuffer : stderrBuffer).split(
        /\n/gu,
      );
      const remainder = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }
        if (shouldSuppressForeignTerminalLine(trimmed)) {
          appendCliTrace(logger, `tui:suppressed-${source}`, trimmed);
          continue;
        }
        routeForeignActivity(source, trimmed);
      }

      if (source === "stdout") {
        stdoutBuffer = remainder;
      } else {
        stderrBuffer = remainder;
      }
      if (shouldDeferForeignOutput(textEntryFocused(), overlaysOpen())) {
        scheduleDeferredForeignRefresh();
      } else {
        flushDeferredForeignActivity();
        scheduleRefreshPanels(0);
      }

      if (typeof encoding === "function") {
        encoding();
      }
      callback?.();
      return true;
    };

  const interceptConsole =
    (method: keyof typeof originalConsole) =>
    (...args: unknown[]): void => {
      if (isScreenDestroyed() || isShuttingDown()) {
        originalConsole[method](...args);
        return;
      }

      const sanitized = formatForeignTerminalArgs(args);
      if (!sanitized || shouldSuppressForeignTerminalLine(sanitized)) {
        return;
      }

      routeForeignActivity("console", sanitized);
    };

  process.stdout.write = interceptWrite(
    "stdout",
    originalStdoutWrite,
  ) as typeof process.stdout.write;
  process.stderr.write = interceptWrite(
    "stderr",
    originalStderrWrite,
  ) as typeof process.stderr.write;
  console.log = interceptConsole("log");
  console.info = interceptConsole("info");
  console.warn = interceptConsole("warn");
  console.error = interceptConsole("error");

  return () => {
    process.stdout.write = originalStdoutWrite as typeof process.stdout.write;
    process.stderr.write = originalStderrWrite as typeof process.stderr.write;
    console.log = originalConsole.log;
    console.info = originalConsole.info;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    flushBuffer("stdout");
    flushBuffer("stderr");
  };
}

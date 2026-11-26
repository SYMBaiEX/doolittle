import type { AppLogger } from "@doolittle/agent/logging/logger";
import { sanitizeTerminalText } from "./render-utils";
import { appendCliTrace } from "./runtime-errors";
import {
  formatForeignTerminalArgs,
  shouldDeferForeignOutput,
  shouldSuppressForeignTerminalLine,
} from "./tui-foreign-output-routing";

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

/**
 * Line-buffering state for one intercepted stream. Chunks arrive in arbitrary
 * byte groupings (a single write may carry several lines, or a line may be
 * split across many writes), so complete lines are only emitted on real line
 * boundaries. A trailing fragment with no newline yet is held in `fragment`
 * and flushed either when the newline finally arrives, when the stream goes
 * quiet for a moment, or when interception is torn down.
 */
interface PendingStreamBuffer {
  fragment: string;
  idleTimer: NodeJS.Timeout | null;
}

/** Quiet-period after which a newline-less fragment is emitted as its own line. */
const PARTIAL_LINE_IDLE_MS = 300;
/** Backstop so pathological newline-less output cannot grow memory unbounded. */
const MAX_FRAGMENT_LENGTH = 2_000;

function createPendingStreamBuffer(): PendingStreamBuffer {
  return { fragment: "", idleTimer: null };
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
  const buffers: Record<"stdout" | "stderr", PendingStreamBuffer> = {
    stdout: createPendingStreamBuffer(),
    stderr: createPendingStreamBuffer(),
  };

  const emitLine = (source: "stdout" | "stderr", rawLine: string): void => {
    const sanitized = sanitizeForeignTerminalWrite(rawLine).trim();
    if (!sanitized) {
      return;
    }
    if (shouldSuppressForeignTerminalLine(sanitized)) {
      appendCliTrace(logger, `tui:suppressed-${source}`, sanitized);
      return;
    }
    routeForeignActivity(source, sanitized);
  };

  const clearIdleTimer = (buffer: PendingStreamBuffer): void => {
    if (buffer.idleTimer) {
      clearTimeout(buffer.idleTimer);
      buffer.idleTimer = null;
    }
  };

  const flushFragment = (source: "stdout" | "stderr"): void => {
    const buffer = buffers[source];
    clearIdleTimer(buffer);
    const pending = buffer.fragment;
    buffer.fragment = "";
    if (pending) {
      emitLine(source, pending);
    }
  };

  const armIdleFlush = (source: "stdout" | "stderr"): void => {
    const buffer = buffers[source];
    clearIdleTimer(buffer);
    if (!buffer.fragment) {
      return;
    }
    buffer.idleTimer = setTimeout(() => {
      buffer.idleTimer = null;
      if (isScreenDestroyed() || isShuttingDown()) {
        buffer.fragment = "";
        return;
      }
      flushFragment(source);
      if (shouldDeferForeignOutput(textEntryFocused(), overlaysOpen())) {
        scheduleDeferredForeignRefresh();
      } else {
        flushDeferredForeignActivity();
        scheduleRefreshPanels(0);
      }
    }, PARTIAL_LINE_IDLE_MS);
    buffer.idleTimer.unref?.();
  };

  const ingestText = (source: "stdout" | "stderr", text: string): void => {
    const buffer = buffers[source];
    buffer.fragment += text;

    // Split on real line boundaries only. CR counts because foreign progress
    // output rewrites lines with carriage returns and never emits LF; empty
    // segments (e.g. from CRLF) carry no content and are dropped by emitLine.
    const segments = buffer.fragment.split(/\r\n|[\r\n]/u);
    buffer.fragment = segments.pop() ?? "";
    for (const line of segments) {
      emitLine(source, line);
    }

    if (buffer.fragment.length > MAX_FRAGMENT_LENGTH) {
      flushFragment(source);
      return;
    }
    armIdleFlush(source);
  };

  const flushBuffer = (source: "stdout" | "stderr") => {
    flushFragment(source);
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

      if (!text) {
        if (typeof encoding === "function") {
          encoding();
        }
        callback?.();
        return true;
      }

      ingestText(source, text);

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

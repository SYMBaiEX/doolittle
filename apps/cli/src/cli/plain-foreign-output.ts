import { sanitizeSingleLineTerminalText } from "./render-utils";
import { renderPlainRunLine } from "./shell-chrome";
import {
  formatForeignTerminalArgs,
  shouldSuppressForeignTerminalLine,
} from "./tui-foreign-output-routing";

const MAX_PENDING_FOREIGN_LINES = 6;

export interface PlainForeignOutputController {
  /** Write queued warnings/errors at a point where readline owns no prompt row. */
  drain(): void;
  /** Restore foreign output ownership. Undrained diagnostics remain suppressed. */
  close(): void;
}

function classifyStderrLine(text: string): "warn" | "error" {
  return /\b(?:error|fatal|failed|failure)\b/iu.test(text) ? "error" : "warn";
}

/**
 * The plain shell owns stdout through readline and its transcript renderer.
 * SDK/plugin operational logging uses console methods (and occasionally raw
 * stderr writes) without any readline awareness. Replaying those bytes as they
 * arrive corrupts the active prompt line and floods the banner out of view.
 *
 * Informational foreign output is suppressed while the interactive shell owns
 * the terminal. Warnings and errors are line-buffered and deferred until the
 * prompt loop is between input rows, where `drain()` can print a bounded number
 * without clobbering typed input. Initial boot output is captured separately
 * and shutdown output is captured by the entrypoint after the shell closes.
 */
export function installPlainForeignOutputRouting(options: {
  enabled: boolean;
  output: NodeJS.WriteStream;
}): PlainForeignOutputController {
  if (!options.enabled) {
    return {
      drain: () => undefined,
      close: () => undefined,
    };
  }

  const originalConsole = {
    debug: console.debug,
    error: console.error,
    info: console.info,
    log: console.log,
    warn: console.warn,
  };
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  const pending: Array<{ severity: "warn" | "error"; text: string }> = [];
  let suppressedOverflow = 0;
  let stderrFragment = "";

  const queueForeignLine = (
    severity: "warn" | "error",
    rawText: string,
  ): void => {
    const text = sanitizeSingleLineTerminalText(rawText);
    if (!text || shouldSuppressForeignTerminalLine(text)) return;
    if (pending.length >= MAX_PENDING_FOREIGN_LINES) {
      suppressedOverflow += 1;
      return;
    }
    pending.push({ severity, text });
  };

  const ingestStderrText = (text: string): void => {
    stderrFragment += text;
    const segments = stderrFragment.split(/\r\n|[\r\n]/u);
    stderrFragment = segments.pop() ?? "";
    for (const line of segments) {
      queueForeignLine(classifyStderrLine(line), line);
    }
  };

  const flushStderrFragment = (): void => {
    const fragment = stderrFragment;
    stderrFragment = "";
    if (fragment) queueForeignLine(classifyStderrLine(fragment), fragment);
  };

  const suppress = () => undefined;
  console.debug = suppress;
  console.info = suppress;
  console.log = suppress;
  console.warn = (...args: unknown[]) => {
    queueForeignLine("warn", formatForeignTerminalArgs(args));
  };
  console.error = (...args: unknown[]) => {
    queueForeignLine("error", formatForeignTerminalArgs(args));
  };
  process.stderr.write = ((
    chunk: string | Uint8Array,
    encoding?: BufferEncoding | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void,
  ): boolean => {
    const text =
      typeof chunk === "string"
        ? chunk
        : Buffer.from(chunk).toString(
            typeof encoding === "string" ? encoding : "utf8",
          );
    if (text) ingestStderrText(text);
    const done = typeof encoding === "function" ? encoding : callback;
    if (done) queueMicrotask(done);
    return true;
  }) as typeof process.stderr.write;

  return {
    drain() {
      flushStderrFragment();
      if (pending.length === 0 && suppressedOverflow === 0) return;
      for (const entry of pending.splice(0)) {
        options.output.write(
          `${renderPlainRunLine(`runtime ${entry.severity} · ${entry.text}`, "[runtime]")}\n`,
        );
      }
      if (suppressedOverflow > 0) {
        options.output.write(
          `${renderPlainRunLine(`runtime warn · suppressed ${suppressedOverflow} additional runtime diagnostic${suppressedOverflow === 1 ? "" : "s"}`, "[runtime]")}\n`,
        );
        suppressedOverflow = 0;
      }
      options.output.write("\n");
    },
    close() {
      console.debug = originalConsole.debug;
      console.error = originalConsole.error;
      console.info = originalConsole.info;
      console.log = originalConsole.log;
      console.warn = originalConsole.warn;
      process.stderr.write = originalStderrWrite as typeof process.stderr.write;
      pending.length = 0;
      stderrFragment = "";
      suppressedOverflow = 0;
    },
  };
}

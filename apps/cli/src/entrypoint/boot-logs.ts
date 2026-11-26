import { sanitizeSingleLineTerminalText } from "../cli/render-utils";

function sanitizeBootLogLine(text: string): string {
  return sanitizeSingleLineTerminalText(text);
}

/**
 * Boot output is captured chunk-by-chunk while the runtime loads, but chunks
 * are byte groupings, not lines: a single logical line may be split across
 * several writes. Each stream is line-buffered so the replayed boot log shows
 * complete lines instead of one shredded entry per write; trailing fragments
 * flush when the capture window closes.
 */
export async function captureBootLogs<T>(
  enabled: boolean,
  task: () => Promise<T>,
): Promise<{
  result: T;
  logs: Array<{ source: "stdout" | "stderr"; text: string }>;
}> {
  if (!enabled) {
    return {
      result: await task(),
      logs: [],
    };
  }

  const logs: Array<{ source: "stdout" | "stderr"; text: string }> = [];
  const fragments: Record<"stdout" | "stderr", string> = {
    stdout: "",
    stderr: "",
  };
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);

  const emitLine = (source: "stdout" | "stderr", rawLine: string): void => {
    const sanitized = sanitizeBootLogLine(rawLine);
    if (sanitized) {
      logs.push({ source, text: sanitized });
    }
  };

  const intercept =
    (source: "stdout" | "stderr") =>
    (
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
      if (text) {
        fragments[source] += text;
        const segments = fragments[source].split(/\r\n|[\r\n]/u);
        fragments[source] = segments.pop() ?? "";
        for (const line of segments) {
          emitLine(source, line);
        }
      }
      if (typeof encoding === "function") {
        encoding();
      }
      callback?.();
      return true;
    };

  process.stdout.write = intercept("stdout") as typeof process.stdout.write;
  process.stderr.write = intercept("stderr") as typeof process.stderr.write;

  try {
    return {
      result: await task(),
      logs,
    };
  } finally {
    process.stdout.write = originalStdoutWrite as typeof process.stdout.write;
    process.stderr.write = originalStderrWrite as typeof process.stderr.write;
    for (const source of ["stdout", "stderr"] as const) {
      const pending = fragments[source];
      fragments[source] = "";
      if (pending) {
        emitLine(source, pending);
      }
    }
  }
}

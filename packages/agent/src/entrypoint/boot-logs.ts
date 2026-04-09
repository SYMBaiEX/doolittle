import { sanitizeSingleLineTerminalText } from "@/cli/render-utils";

export function sanitizeBootLogLine(text: string): string {
  return sanitizeSingleLineTerminalText(text);
}

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
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);

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
      const sanitized = sanitizeBootLogLine(text);
      if (sanitized) {
        logs.push({ source, text: sanitized });
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
  }
}

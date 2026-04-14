import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CliExecutionResult } from "@/cli/execution";
import {
  type ResponseTranscriptEntry,
  renderPlainEntry,
  renderPlainTranscript,
} from "@/cli/transcript-renderer";
import type { AppContext } from "@/runtime/bootstrap";

const MAX_HISTORY_ENTRIES = 48;

export function defaultNowStamp(): string {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function isConversationalInput(text: string): boolean {
  const trimmed = text.trim();
  return !!trimmed && !trimmed.startsWith("/") && !trimmed.startsWith("!");
}

export function writeTranscriptExport(
  context: AppContext,
  history: ResponseTranscriptEntry[],
): void {
  try {
    writeFileSync(
      join(context.config.dataDir, "latest-transcript.txt"),
      `${renderPlainTranscript(history)}\n`,
      "utf8",
    );
  } catch {
    // Best effort only.
  }
}

interface PlainEntryWriterOptions {
  context: AppContext;
  interactiveShell: boolean;
  output: NodeJS.WriteStream;
  responseHistory: ResponseTranscriptEntry[];
}

export function createPlainEntryWriter(options: PlainEntryWriterOptions): {
  pushPlainEntry: (
    entry: ResponseTranscriptEntry,
    tone?: CliExecutionResult["tone"],
  ) => void;
  persistTranscript: (history: ResponseTranscriptEntry[]) => void;
} {
  const { context, interactiveShell, output, responseHistory } = options;
  const persistTranscript = (history: ResponseTranscriptEntry[]) => {
    writeTranscriptExport(context, history);
  };

  const pushPlainEntry = (
    entry: ResponseTranscriptEntry,
    tone?: CliExecutionResult["tone"],
  ) => {
    responseHistory.push(entry);
    if (responseHistory.length > MAX_HISTORY_ENTRIES) {
      responseHistory.splice(0, responseHistory.length - MAX_HISTORY_ENTRIES);
    }
    persistTranscript(responseHistory);
    if (!interactiveShell) {
      output.write(`${entry.body.trim()}\n`);
      return;
    }
    output.write(`\n${renderPlainEntry(entry, tone)}\n\n`);
  };

  return { pushPlainEntry, persistTranscript };
}

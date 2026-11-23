import { writeFileSync } from "node:fs";
import type { ResponseTranscriptEntry } from "../transcript-renderer/index";
import {
  renderPlainTranscript,
  renderResponseTranscript,
} from "../transcript-renderer/index";

type TuiResponsePane = {
  setContent(content: string): void;
  getScrollPerc(): number;
  setScrollPerc(percent: number): void;
};

const TRANSCRIPT_WRITE_INTERVAL_MS = 500;

type PendingTranscriptWrite = {
  lastWriteAt: number;
  timer?: ReturnType<typeof setTimeout>;
  responseHistory: ResponseTranscriptEntry[];
  liveResponse: ResponseTranscriptEntry | undefined;
};

const transcriptWrites = new Map<string, PendingTranscriptWrite>();

function persistTranscriptExport(
  transcriptExportPath: string,
  responseHistory: ResponseTranscriptEntry[],
  liveResponse: ResponseTranscriptEntry | undefined,
): void {
  try {
    writeFileSync(
      transcriptExportPath,
      `${renderPlainTranscript(responseHistory, liveResponse)}\n`,
      "utf8",
    );
  } catch {
    // Best effort only.
  }
}

// Coalesce transcript exports so a burst of streaming renders writes at most
// once per interval; the latest state is always persisted by a trailing write.
function scheduleTranscriptExport(
  transcriptExportPath: string,
  responseHistory: ResponseTranscriptEntry[],
  liveResponse: ResponseTranscriptEntry | undefined,
): void {
  let pending = transcriptWrites.get(transcriptExportPath);
  if (!pending) {
    pending = { lastWriteAt: 0, responseHistory, liveResponse };
    transcriptWrites.set(transcriptExportPath, pending);
  }
  pending.responseHistory = responseHistory;
  pending.liveResponse = liveResponse;
  const elapsed = Date.now() - pending.lastWriteAt;
  if (elapsed >= TRANSCRIPT_WRITE_INTERVAL_MS) {
    if (pending.timer) {
      clearTimeout(pending.timer);
      pending.timer = undefined;
    }
    pending.lastWriteAt = Date.now();
    persistTranscriptExport(
      transcriptExportPath,
      pending.responseHistory,
      pending.liveResponse,
    );
    return;
  }
  if (!pending.timer) {
    pending.timer = setTimeout(() => {
      pending.timer = undefined;
      pending.lastWriteAt = Date.now();
      persistTranscriptExport(
        transcriptExportPath,
        pending.responseHistory,
        pending.liveResponse,
      );
    }, TRANSCRIPT_WRITE_INTERVAL_MS - elapsed);
    pending.timer.unref();
  }
}

export function renderTranscriptPane(input: {
  responsePane: TuiResponsePane;
  responseHistory: ResponseTranscriptEntry[];
  liveResponse: ResponseTranscriptEntry | undefined;
  transcriptExportPath: string;
}): void {
  const pinnedToBottom = input.responsePane.getScrollPerc() >= 96;
  input.responsePane.setContent(
    renderResponseTranscript(input.responseHistory, input.liveResponse),
  );
  scheduleTranscriptExport(
    input.transcriptExportPath,
    input.responseHistory,
    input.liveResponse,
  );
  if (pinnedToBottom) {
    input.responsePane.setScrollPerc(100);
  }
}

export function writeTranscriptExport(
  transcriptExportPath: string,
  responseHistory: ResponseTranscriptEntry[],
  liveResponse: ResponseTranscriptEntry | undefined,
): string {
  const transcript = `${renderPlainTranscript(responseHistory, liveResponse)}\n`;
  writeFileSync(transcriptExportPath, transcript, "utf8");
  return transcript;
}

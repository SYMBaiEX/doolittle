import { writeFileSync } from "node:fs";
import type { ResponseTranscriptEntry } from "../transcript-renderer/index";
import {
  renderPlainTranscript,
  renderResponseTranscript,
} from "../transcript-renderer/index";
import {
  prepareTranscriptScrollForRender,
  resetTranscriptScrollState,
  scrollTranscriptToBottom,
} from "./scroll-pin";

type TuiResponsePane = {
  setContent(content: string): void;
  getScrollPerc(): number;
  setScrollPerc(percent: number): void;
};

// Content the pane already shows never needs a second parse: streaming emits
// a render per chunk, and blessed's setContent re-wraps the whole transcript
// every time. The write is skipped unless the transcript text actually moved.
const lastPaneContent = new WeakMap<TuiResponsePane, string>();

const TRANSCRIPT_WRITE_INTERVAL_MS = 500;

type PendingTranscriptWrite = {
  lastWriteAt: number;
  timer?: ReturnType<typeof setTimeout>;
  responseHistory: ResponseTranscriptEntry[];
  liveResponse: ResponseTranscriptEntry | undefined;
};

const transcriptWrites = new Map<string, PendingTranscriptWrite>();

let exitFlushRegistered = false;

// A pending trailing write would otherwise be dropped on abrupt exit (e.g.
// Ctrl+C through forceTerminateCli -> process.exit); flush it synchronously.
function ensureExitFlush(): void {
  if (exitFlushRegistered) {
    return;
  }
  exitFlushRegistered = true;
  process.on("exit", () => {
    for (const [path, pending] of transcriptWrites) {
      if (pending.timer) {
        persistTranscriptExport(
          path,
          pending.responseHistory,
          pending.liveResponse,
        );
      }
    }
  });
}

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
  ensureExitFlush();
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
  expandBodies?: boolean;
}): void {
  // The boot welcome is reference copy, not a live tail: at minimum geometry
  // it must remain readable from the top. Once operator dialogue exists, the
  // continuously observed scroll state decides whether new content follows
  // the tail; tracking also keeps the pre-resize pin/anchor snapshot used by
  // geometry reconciliation.
  const tailFollowEnabled =
    input.liveResponse !== undefined ||
    input.responseHistory.some((entry) => entry.kind !== "system");
  if (input.liveResponse === undefined && input.responseHistory.length === 0) {
    resetTranscriptScrollState(input.responsePane);
  }
  const { pinnedToBottom } = prepareTranscriptScrollForRender(
    input.responsePane,
    { tailFollowEnabled },
  );
  const content = renderResponseTranscript(
    input.responseHistory,
    input.liveResponse,
    { expandBodies: input.expandBodies },
  );
  if (lastPaneContent.get(input.responsePane) !== content) {
    lastPaneContent.set(input.responsePane, content);
    input.responsePane.setContent(content);
  }
  scheduleTranscriptExport(
    input.transcriptExportPath,
    input.responseHistory,
    input.liveResponse,
  );
  if (tailFollowEnabled && pinnedToBottom) {
    scrollTranscriptToBottom(input.responsePane);
  }
  // When the operator scrolled up deliberately nothing is touched: blessed
  // keeps childBase across setContent and transcript entries are append-only,
  // so their reading position survives streaming growth below the fold.
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

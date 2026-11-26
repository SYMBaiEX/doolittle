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

// Structural view of the blessed ScrollableBox scroll internals the pane
// carries in production. All members are optional so lightweight test doubles
// keep satisfying the narrow interface above; when they are present the
// pin measurement is exact to the line instead of a percentage heuristic.
type BlessedScrollMetrics = {
  childBase?: number;
  iheight?: number;
  lpos?: { yi: number; yl: number } | null;
  getScrollHeight?(): number;
};

// Content the pane already shows never needs a second parse: streaming emits
// a render per chunk, and blessed's setContent re-wraps the whole transcript
// every time. The write is skipped unless the transcript text actually moved.
const lastPaneContent = new WeakMap<TuiResponsePane, string>();

// Pinning is exact line arithmetic: the user is pinned when the topmost
// visible line already sits at the deepest scroll offset. When the transcript
// still fits the pane both offsets are zero, so a fresh session starts pinned
// and the first overflow follows the tail — the percentage heuristic could
// not express that case (it reads 0 both for "nothing to scroll" and for
// "scrolled back to the very top"), which is why new replies used to land
// below the fold unseen.
function measurePinnedToBottom(pane: TuiResponsePane): boolean {
  const metrics = pane as TuiResponsePane & BlessedScrollMetrics;
  try {
    if (
      typeof metrics.childBase === "number" &&
      typeof metrics.iheight === "number" &&
      metrics.lpos &&
      typeof metrics.getScrollHeight === "function"
    ) {
      const visible = metrics.lpos.yl - metrics.lpos.yi - metrics.iheight;
      const maxChildBase = Math.max(0, metrics.getScrollHeight() - visible);
      return metrics.childBase >= maxChildBase;
    }
  } catch {
    // Fall through to the conservative default below.
  }
  // Without measurable scroll state there is no position to preserve; following
  // the tail matches operator expectation for a live transcript.
  return true;
}

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
}): void {
  // Measure before replacing content: the pin decision belongs to the view the
  // user is actually looking at, not the one being swapped in.
  const pinnedToBottom = measurePinnedToBottom(input.responsePane);
  const content = renderResponseTranscript(
    input.responseHistory,
    input.liveResponse,
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
  if (pinnedToBottom) {
    input.responsePane.setScrollPerc(100);
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

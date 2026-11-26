type ScrollEventPane = {
  setScrollPerc(percent: number): void;
  scrollTo?(offset: number, always?: boolean): void;
  on?(event: "scroll", handler: () => void): void;
};

// Structural view of the blessed ScrollableBox internals the production pane
// carries. Everything is optional so lightweight transcript test doubles can
// use the same render path without implementing blessed's private surface.
type BlessedScrollMetrics = {
  childBase?: number;
  height?: number;
  hidden?: boolean;
  iheight?: number;
  lpos?: { yi: number; yl: number } | null;
  getScrollHeight?(): number;
  _clines?: {
    length?: number;
    rtof?: number[];
    ftor?: Array<number[] | undefined>;
    fake?: { length: number };
  };
};

type TranscriptScrollAnchor = {
  childBase: number;
  fakeLine?: number;
  offsetInFakeLine: number;
};

type TranscriptScrollState = {
  pinnedToBottom: boolean;
  tailFollowEnabled: boolean;
  anchor?: TranscriptScrollAnchor;
};

const scrollStates = new WeakMap<ScrollEventPane, TranscriptScrollState>();
const trackedPanes = new WeakSet<ScrollEventPane>();
let programmaticScrollDepth = 0;

function visibleTranscriptLines(
  metrics: ScrollEventPane & BlessedScrollMetrics,
): number | undefined {
  if (typeof metrics.iheight !== "number") return undefined;
  if (metrics.lpos) {
    return Math.max(0, metrics.lpos.yl - metrics.lpos.yi - metrics.iheight);
  }
  if (typeof metrics.height === "number") {
    return Math.max(0, metrics.height - metrics.iheight);
  }
  return undefined;
}

function transcriptContentLines(
  metrics: ScrollEventPane & BlessedScrollMetrics,
): number | undefined {
  // Conversation content is pure text. Prefer the wrapped content-line count
  // over blessed's getScrollHeight(): ScrollableBox mixes in child-element
  // bottoms, and its cached `_scrollBottom` can survive a resize with a stale,
  // much larger value. Trusting that inflated height overshoots the tail and
  // repaints an empty pane after widening.
  if (typeof metrics._clines?.length === "number") {
    return metrics._clines.length;
  }
  try {
    return metrics.getScrollHeight?.();
  } catch {
    return undefined;
  }
}

function maxTranscriptChildBase(
  metrics: ScrollEventPane & BlessedScrollMetrics,
): number | undefined {
  const visible = visibleTranscriptLines(metrics);
  const contentLines = transcriptContentLines(metrics);
  if (visible === undefined || contentLines === undefined) return undefined;
  return Math.max(0, contentLines - visible);
}

// Pinning is exact line arithmetic: the user is pinned when the topmost
// visible line already sits at the deepest scroll offset. When the transcript
// still fits the pane both offsets are zero, so a fresh session starts pinned
// and the first overflow follows the tail — the percentage heuristic cannot
// express that case (it reads 0 both for "nothing to scroll" and for
// "scrolled back to the very top").
function measureTranscriptPinnedToBottom(pane: ScrollEventPane): boolean {
  const metrics = pane as ScrollEventPane & BlessedScrollMetrics;
  try {
    if (typeof metrics.childBase === "number") {
      const maxChildBase = maxTranscriptChildBase(metrics);
      if (maxChildBase !== undefined) {
        return metrics.childBase >= maxChildBase;
      }
    }
  } catch {
    // Fall through to the conservative default below.
  }
  // Without measurable scroll state there is no position to preserve; following
  // the tail matches operator expectation for a live transcript.
  return true;
}

function captureScrollAnchor(
  metrics: ScrollEventPane & BlessedScrollMetrics,
): TranscriptScrollAnchor | undefined {
  if (typeof metrics.childBase !== "number") return undefined;
  const childBase = Math.max(0, Math.floor(metrics.childBase));
  const rtof = metrics._clines?.rtof;
  if (!rtof || rtof.length === 0) {
    return { childBase, offsetInFakeLine: 0 };
  }
  const anchorRow = Math.min(childBase, rtof.length - 1);
  const fakeLine = rtof[anchorRow];
  const range = metrics._clines?.ftor?.[fakeLine];
  const fakeLineStart = range?.[0];
  const offsetInFakeLine =
    typeof fakeLineStart === "number"
      ? Math.max(0, anchorRow - fakeLineStart)
      : 0;
  return { childBase, fakeLine, offsetInFakeLine };
}

function captureTranscriptScrollState(
  pane: ScrollEventPane,
): TranscriptScrollState {
  const metrics = pane as ScrollEventPane & BlessedScrollMetrics;
  const previous = scrollStates.get(pane);
  // Hidden panes cannot be scrolled deliberately. Blessed may clear or clamp
  // their positional state while they are invisible, so transcript growth in
  // a hidden cockpit must not overwrite the operator-owned pre-hide position.
  if (metrics.hidden === true && previous) {
    return previous;
  }
  const state: TranscriptScrollState = {
    pinnedToBottom: measureTranscriptPinnedToBottom(pane),
    tailFollowEnabled: previous?.tailFollowEnabled ?? false,
    anchor: captureScrollAnchor(metrics),
  };
  scrollStates.set(pane, state);
  return state;
}

// User scrolling does not pass through transcript rendering, so pin state must
// be continuously observed. Resize rewraps and clamps childBase before the
// cockpit resize handler runs; this listener is the only reliable pre-resize
// position source. Programmatic restoration suppresses the capture so a
// temporary clamp cannot overwrite the operator's original pin state.
function trackTranscriptScrollState(pane: ScrollEventPane): void {
  if (trackedPanes.has(pane) || typeof pane.on !== "function") return;
  trackedPanes.add(pane);
  pane.on("scroll", () => {
    if (programmaticScrollDepth === 0) {
      captureTranscriptScrollState(pane);
    }
  });
}

// Rendering trusts the continuously observed scroll state once it exists.
// Re-measuring on every content mutation would mistake implementation-driven
// clamping during geometry changes for an operator scroll. The first capture
// happens before mutation; after that, deliberate scroll events own the state.
export function prepareTranscriptScrollForRender(
  pane: ScrollEventPane,
  options: { tailFollowEnabled: boolean },
): TranscriptScrollState {
  trackTranscriptScrollState(pane);
  const state = scrollStates.get(pane) ?? captureTranscriptScrollState(pane);
  state.tailFollowEnabled = options.tailFollowEnabled;
  return state;
}

export function resetTranscriptScrollState(pane: ScrollEventPane): void {
  scrollStates.set(pane, {
    pinnedToBottom: true,
    tailFollowEnabled: false,
    anchor: { childBase: 0, offsetInFakeLine: 0 },
  });
}

function runProgrammaticScroll(scroll: () => void): void {
  programmaticScrollDepth += 1;
  try {
    scroll();
  } finally {
    programmaticScrollDepth -= 1;
  }
}

export function scrollTranscriptToBottom(pane: ScrollEventPane): void {
  const metrics = pane as ScrollEventPane & BlessedScrollMetrics;
  const target = maxTranscriptChildBase(metrics);
  runProgrammaticScroll(() => {
    if (target !== undefined && typeof metrics.scrollTo === "function") {
      metrics.scrollTo(target);
      return;
    }
    pane.setScrollPerc(100);
  });
}

function resolveAnchoredChildBase(
  metrics: ScrollEventPane & BlessedScrollMetrics,
  anchor: TranscriptScrollAnchor,
): number {
  const rtof = metrics._clines?.rtof;
  if (anchor.fakeLine !== undefined && rtof && rtof.length > 0) {
    const fakeLineCount =
      metrics._clines?.fake?.length ?? (rtof[rtof.length - 1] ?? 0) + 1;
    const fakeLine = Math.max(
      0,
      Math.min(anchor.fakeLine, Math.max(0, fakeLineCount - 1)),
    );
    const range = metrics._clines?.ftor?.[fakeLine];
    if (range && typeof range[0] === "number") {
      const start = range[0];
      const end = typeof range[1] === "number" ? range[1] : start;
      const offset = Math.min(
        anchor.offsetInFakeLine,
        Math.max(0, end - start),
      );
      return start + offset;
    }
    const wrappedRow = rtof.findIndex((line) => line >= fakeLine);
    if (wrappedRow >= 0) return wrappedRow;
    return rtof.length - 1;
  }
  return anchor.childBase;
}

// Geometry mutation rewraps the transcript before the cockpit gets a resize
// callback, and blessed may clamp or clear positional state while widgets are
// hidden. Re-apply the last operator-owned scroll state after every layout:
// bottom-pinned views follow the new tail; deliberately scrolled views return
// to the same logical transcript line when rewrapping permits it.
export function reconcileTranscriptScrollAfterLayout(
  pane: ScrollEventPane,
): void {
  const state = scrollStates.get(pane);
  if (!state?.tailFollowEnabled) return;
  if (state.pinnedToBottom) {
    scrollTranscriptToBottom(pane);
    return;
  }
  if (!state.anchor) return;
  const metrics = pane as ScrollEventPane & BlessedScrollMetrics;
  if (typeof metrics.scrollTo !== "function") return;
  const target = Math.max(
    0,
    Math.floor(resolveAnchoredChildBase(metrics, state.anchor)),
  );
  runProgrammaticScroll(() => {
    metrics.scrollTo?.(target);
  });
}

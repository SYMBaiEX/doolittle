import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import type { ResponseTranscriptEntry } from "../../apps/cli/src/cli/transcript-renderer/index";
import { renderPlainTranscript } from "../../apps/cli/src/cli/transcript-renderer/index";
import { renderTranscriptPane } from "../../apps/cli/src/cli/tui-transcript/rendering";

// Viewport pin behavior: the pane double emulates the blessed ScrollableBox
// metrics (childBase / lpos / iheight / getScrollHeight) the renderer measures
// before swapping content. lineHeight here stands in for wrapped rows.

interface FakePaneOptions {
  scrollHeight: number;
  visible: number;
  childBase: number;
}

function fakeBlessedPane({
  scrollHeight,
  visible,
  childBase,
}: FakePaneOptions) {
  const calls = { setContent: 0, setScrollPerc: [] as number[] };
  const pane = {
    childBase,
    iheight: 2,
    lpos: { yi: 3, yl: 3 + visible + 2 },
    getScrollHeight: () => scrollHeight,
    content: "",
    setContent(content: string) {
      calls.setContent += 1;
      this.content = content;
    },
    getScrollPerc: () => 0,
    setScrollPerc(percent: number) {
      calls.setScrollPerc.push(percent);
    },
  };
  return { pane, calls };
}

function entry(index: number): ResponseTranscriptEntry {
  return {
    label: "You",
    body: `message ${index}`,
    at: "12:00:00",
    kind: "user",
  };
}

function systemEntry(index: number): ResponseTranscriptEntry {
  return {
    label: "Helm Ready",
    body: `welcome ${index}`,
    at: "12:00:00",
    kind: "system",
  };
}

const dirs: string[] = [];

function transcriptPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "tui-viewport-"));
  dirs.push(dir);
  return join(dir, "transcript.txt");
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

it("keeps the full history in the plain transcript instead of windowing to the latest entries", () => {
  const history = Array.from({ length: 60 }, (_, index) => entry(index + 1));
  const transcript = renderPlainTranscript(history);
  expect(transcript).toContain("message 1");
  expect(transcript).toContain("message 25");
  expect(transcript).toContain("message 60");
});

it("restores bottom pinning after render when the viewer is at the transcript tail", () => {
  // 100 lines of content, 16 visible: deepest scroll offset is 84.
  const { pane, calls } = fakeBlessedPane({
    scrollHeight: 100,
    visible: 16,
    childBase: 84,
  });
  renderTranscriptPane({
    responsePane: pane,
    responseHistory: [entry(1)],
    liveResponse: undefined,
    transcriptExportPath: transcriptPath(),
  });
  expect(calls.setScrollPerc).toEqual([100]);
});

it("treats a non-overflowing transcript as pinned so the first overflow follows the tail", () => {
  // Content fits entirely: childBase can only be 0 and maxChildBase is 0.
  const { pane, calls } = fakeBlessedPane({
    scrollHeight: 10,
    visible: 16,
    childBase: 0,
  });
  renderTranscriptPane({
    responsePane: pane,
    responseHistory: [entry(1)],
    liveResponse: undefined,
    transcriptExportPath: transcriptPath(),
  });
  expect(calls.setScrollPerc).toEqual([100]);
});

it("never yanks the viewport when the operator scrolled up, even one line", () => {
  // One line above the deepest offset: percentage heuristics round this back
  // to ~99% on long transcripts, but exact line arithmetic must not.
  const { pane, calls } = fakeBlessedPane({
    scrollHeight: 500,
    visible: 16,
    childBase: 483,
  });
  renderTranscriptPane({
    responsePane: pane,
    responseHistory: [entry(1)],
    liveResponse: undefined,
    transcriptExportPath: transcriptPath(),
  });
  expect(calls.setScrollPerc).toEqual([]);
});

it("follows the tail when scroll metrics are not measurable", () => {
  const calls = { setScrollPerc: [] as number[] };
  const pane = {
    content: "",
    setContent(content: string) {
      this.content = content;
    },
    getScrollPerc: () => 0,
    setScrollPerc(percent: number) {
      calls.setScrollPerc.push(percent);
    },
  };
  renderTranscriptPane({
    responsePane: pane,
    responseHistory: [entry(1)],
    liveResponse: undefined,
    transcriptExportPath: transcriptPath(),
  });
  expect(calls.setScrollPerc).toEqual([100]);
});

it("does not tail-pin a system-only welcome, then follows once dialogue begins", () => {
  const { pane, calls } = fakeBlessedPane({
    scrollHeight: 10,
    visible: 16,
    childBase: 0,
  });
  const transcriptExportPath = transcriptPath();
  renderTranscriptPane({
    responsePane: pane,
    responseHistory: [systemEntry(1)],
    liveResponse: undefined,
    transcriptExportPath,
  });
  expect(calls.setScrollPerc).toEqual([]);

  renderTranscriptPane({
    responsePane: pane,
    responseHistory: [systemEntry(1), entry(1)],
    liveResponse: undefined,
    transcriptExportPath,
  });
  expect(calls.setScrollPerc).toEqual([100]);
});

it("resets scroll pinning when the transcript is cleared", () => {
  const { pane, calls } = fakeBlessedPane({
    scrollHeight: 500,
    visible: 16,
    childBase: 483,
  });
  const transcriptExportPath = transcriptPath();
  renderTranscriptPane({
    responsePane: pane,
    responseHistory: [entry(1)],
    liveResponse: undefined,
    transcriptExportPath,
  });
  expect(calls.setScrollPerc).toEqual([]);

  renderTranscriptPane({
    responsePane: pane,
    responseHistory: [],
    liveResponse: undefined,
    transcriptExportPath,
  });
  renderTranscriptPane({
    responsePane: pane,
    responseHistory: [entry(2)],
    liveResponse: undefined,
    transcriptExportPath,
  });
  expect(calls.setScrollPerc).toEqual([100]);
});

it("skips redundant pane writes when the transcript text did not change", () => {
  const { pane, calls } = fakeBlessedPane({
    scrollHeight: 100,
    visible: 16,
    childBase: 84,
  });
  const render = () =>
    renderTranscriptPane({
      responsePane: pane,
      responseHistory: [entry(1)],
      liveResponse: undefined,
      transcriptExportPath: transcriptPath(),
    });
  render();
  render();
  render();
  expect(calls.setContent).toBe(1);
});

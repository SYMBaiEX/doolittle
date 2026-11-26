import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import blessed from "blessed";
import { afterEach, expect, it } from "vitest";
import type { ResponseTranscriptEntry } from "../../apps/cli/src/cli/transcript-renderer/index";
import { renderTranscriptPane } from "../../apps/cli/src/cli/tui-transcript/rendering";

// Drives the production render path against a real blessed ScrollableBox
// wired exactly like the cockpit Conversation panel (same layout-relevant
// options: scrollable, alwaysScroll, wrap, padding, border). Scrolling uses
// the same primitive the screen key bindings invoke — pane.scroll(delta) —
// so pin detection and position preservation are measured through blessed's
// own scroll arithmetic rather than a mock.

function createHarness(width = 110, height = 30) {
  const output = new PassThrough() as PassThrough & {
    columns: number;
    rows: number;
  };
  output.columns = width;
  output.rows = height;
  const input = new PassThrough();
  const screen = blessed.screen({
    smartCSR: true,
    width,
    height,
    output: output as never,
    input: input as never,
    terminal: "xterm-256color",
  });
  const pane = blessed.box({
    parent: screen,
    top: 3,
    left: 0,
    width: "82%",
    height: "64%-1",
    label: " Conversation ",
    tags: true,
    border: "line",
    scrollable: true,
    alwaysScroll: true,
    wrap: true,
    mouse: false,
    keys: true,
    vi: true,
    padding: { left: 1, right: 1 },
    scrollbar: { ch: "█" },
  }) as blessed.Widgets.BoxElement & {
    childBase: number;
    getScrollHeight(): number;
    lpos: { yi: number; yl: number };
    iheight: number;
  };
  return { screen, pane };
}

function userEntry(index: number): ResponseTranscriptEntry {
  return {
    label: "You",
    body: `message ${index}`,
    at: "12:00:00",
    kind: "user",
  };
}

function agentEntry(index: number): ResponseTranscriptEntry {
  return {
    label: "Agent",
    body: `reply ${index}\nsecond line of reply ${index}\nthird line of reply ${index}`,
    at: "12:00:00",
    kind: "assistant",
  };
}

function buildHistory(turns: number): ResponseTranscriptEntry[] {
  const history: ResponseTranscriptEntry[] = [];
  for (let index = 1; index <= turns; index += 1) {
    history.push(userEntry(index), agentEntry(index));
  }
  return history;
}

const dirs: string[] = [];
const screens: blessed.Widgets.Screen[] = [];

function transcriptPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "tui-blessed-scroll-"));
  dirs.push(dir);
  return join(dir, "transcript.txt");
}

function topVisibleLine(pane: {
  childBase: number;
  lpos: { yi: number; yl: number };
  iheight: number;
  getScrollHeight(): number;
}): number {
  return pane.childBase;
}

function maxChildBase(pane: {
  lpos: { yi: number; yl: number };
  iheight: number;
  getScrollHeight(): number;
}): number {
  const visible = pane.lpos.yl - pane.lpos.yi - pane.iheight;
  return Math.max(0, pane.getScrollHeight() - visible);
}

afterEach(() => {
  for (const screen of screens.splice(0)) {
    try {
      screen.destroy();
    } catch {
      // Headless screens have no real program to tear down.
    }
  }
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

it("follows the transcript tail when the operator never scrolled", () => {
  const { screen, pane } = createHarness();
  screens.push(screen);
  const path = transcriptPath();
  const history = buildHistory(6);
  renderTranscriptPane({
    responsePane: pane,
    responseHistory: history,
    liveResponse: undefined,
    transcriptExportPath: path,
  });
  screen.render();
  // A fresh session starts effectively pinned: once the transcript overflows,
  // the deepest scroll offset is reached without any operator input.
  expect(pane.childBase).toBe(maxChildBase(pane));
  expect(maxChildBase(pane)).toBeGreaterThan(0);
});

it("keeps the operator's scroll position when new entries arrive scrolled up", () => {
  const { screen, pane } = createHarness();
  screens.push(screen);
  const path = transcriptPath();
  const history = buildHistory(6);
  renderTranscriptPane({
    responsePane: pane,
    responseHistory: history,
    liveResponse: undefined,
    transcriptExportPath: path,
  });
  screen.render();

  // Operator scrolls back to the very top — the exact primitive the cockpit
  // scroll bindings call on the focused pane.
  pane.scroll(-pane.getScrollHeight());
  screen.render();
  expect(topVisibleLine(pane)).toBe(0);

  // New turn lands: history grows below the fold. The render must not yank.
  history.push(userEntry(7), agentEntry(7));
  renderTranscriptPane({
    responsePane: pane,
    responseHistory: history,
    liveResponse: undefined,
    transcriptExportPath: path,
  });
  screen.render();
  expect(topVisibleLine(pane)).toBe(0);
});

it("resumes tail-following after the operator scrolls back to the bottom", () => {
  const { screen, pane } = createHarness();
  screens.push(screen);
  const path = transcriptPath();
  const history = buildHistory(6);
  renderTranscriptPane({
    responsePane: pane,
    responseHistory: history,
    liveResponse: undefined,
    transcriptExportPath: path,
  });
  screen.render();

  pane.scroll(-pane.getScrollHeight());
  screen.render();
  history.push(userEntry(7), agentEntry(7));
  renderTranscriptPane({
    responsePane: pane,
    responseHistory: history,
    liveResponse: undefined,
    transcriptExportPath: path,
  });
  screen.render();
  expect(topVisibleLine(pane)).toBeLessThan(maxChildBase(pane));

  // Operator scrolls to the bottom again; streaming must re-engage pinning.
  pane.scroll(pane.getScrollHeight());
  screen.render();
  history.push(userEntry(8), agentEntry(8));
  renderTranscriptPane({
    responsePane: pane,
    responseHistory: history,
    liveResponse: undefined,
    transcriptExportPath: path,
  });
  screen.render();
  expect(pane.childBase).toBe(maxChildBase(pane));
});

it("keeps every entry reachable by scrolling — nothing is windowed out", () => {
  const { screen, pane } = createHarness();
  screens.push(screen);
  const path = transcriptPath();
  const history = buildHistory(30);
  renderTranscriptPane({
    responsePane: pane,
    responseHistory: history,
    liveResponse: undefined,
    transcriptExportPath: path,
  });
  screen.render();

  // The pane content itself carries the full transcript: message 1 survives
  // deep in scrollback (60 entries total, far beyond any legacy window).
  const content = pane.getContent();
  expect(content).toContain("message 1");
  expect(content).toContain("message 30");

  pane.scroll(-pane.getScrollHeight());
  screen.render();
  expect(topVisibleLine(pane)).toBe(0);
});

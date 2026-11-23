import type { writeFileSync } from "node:fs";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { ResponseTranscriptEntry } from "../../apps/cli/src/cli/transcript-renderer/index";
import { renderTranscriptPane } from "../../apps/cli/src/cli/tui-transcript/rendering";

const writes = vi.hoisted(() => vi.fn());
vi.mock("node:fs", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs")>();
  return {
    ...original,
    writeFileSync: (...args: Parameters<typeof writeFileSync>) => {
      writes(...args);
      return original.writeFileSync(...args);
    },
  };
});

function pane() {
  let scroll = 100;
  return {
    content: "",
    setContent(content: string) {
      this.content = content;
    },
    getScrollPerc: () => scroll,
    setScrollPerc(percent: number) {
      scroll = percent;
    },
  };
}

function live(body: string): ResponseTranscriptEntry {
  return { label: "agent", body, at: "12:00:00", kind: "assistant" };
}

afterEach(() => {
  vi.useRealTimers();
  writes.mockClear();
});

it("coalesces a burst of renders into at most one disk write per interval and persists the final state", () => {
  vi.useFakeTimers();
  const dir = mkdtempSync(join(tmpdir(), "tui-transcript-"));
  const path = join(dir, "transcript.txt");
  try {
    const responsePane = pane();
    for (let index = 0; index < 200; index += 1) {
      renderTranscriptPane({
        responsePane,
        responseHistory: [],
        liveResponse: live(`chunk ${index}`),
        transcriptExportPath: path,
      });
    }
    // First render writes immediately; the rest of the burst is coalesced.
    expect(writes.mock.calls.length).toBe(1);

    vi.advanceTimersByTime(500);
    expect(writes.mock.calls.length).toBe(2);
    expect(readFileSync(path, "utf8")).toContain("chunk 199");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it("writes again on the next interval during sustained streaming", () => {
  vi.useFakeTimers();
  const dir = mkdtempSync(join(tmpdir(), "tui-transcript-"));
  const path = join(dir, "transcript.txt");
  try {
    const responsePane = pane();
    const render = (body: string) =>
      renderTranscriptPane({
        responsePane,
        responseHistory: [],
        liveResponse: live(body),
        transcriptExportPath: path,
      });
    render("a");
    render("b");
    vi.advanceTimersByTime(500);
    render("c");
    vi.advanceTimersByTime(500);
    render("d");
    expect(writes.mock.calls.length).toBe(3);
    expect(readFileSync(path, "utf8")).toContain("c");
    vi.advanceTimersByTime(500);
    expect(readFileSync(path, "utf8")).toContain("d");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

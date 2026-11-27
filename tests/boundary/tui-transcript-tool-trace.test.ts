import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AppContext } from "@doolittle/agent/runtime/bootstrap";
import { afterEach, expect, it, vi } from "vitest";
import { createTuiTranscriptController } from "../../apps/cli/src/cli/tui-transcript/controller";

const dirs: string[] = [];

function harness() {
  const dir = mkdtempSync(join(tmpdir(), "tui-tool-trace-"));
  dirs.push(dir);
  const transcriptExportPath = join(dir, "transcript.txt");
  const pane = {
    content: "",
    setContent(content: string) {
      this.content = content;
    },
    getScrollPerc: () => 100,
    setScrollPerc: () => {},
  };
  const controller = createTuiTranscriptController({
    context: {
      config: { agentName: "Doolittle" },
      services: { runController: { getActive: () => undefined } },
    } as unknown as AppContext,
    state: { activeSessionId: "session", notices: [] },
    responsePane: pane,
    transcriptExportPath,
    appendActivity: () => {},
    pushNotice: () => {},
    scheduleRefreshPanels: () => {},
    truncate: (text, maxLength) => text.slice(0, maxLength),
    isBusy: () => true,
    canCopyToClipboard: false,
  });
  return { controller, pane, transcriptExportPath };
}

afterEach(() => {
  vi.useRealTimers();
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

it("keeps the full live tool trail on the committed turn while collapsing the viewport trace", () => {
  vi.useFakeTimers();
  const { controller, pane, transcriptExportPath } = harness();
  controller.setLiveResponse("Doolittle", "working", {
    kind: "assistant",
    pending: true,
  });
  for (let index = 1; index <= 8; index += 1) {
    controller.pushLiveToolEvent(`tool ${index} finished`);
  }

  controller.pushResponseEntry("Doolittle", "final answer");
  vi.advanceTimersByTime(500);

  const exported = readFileSync(transcriptExportPath, "utf8");
  for (let index = 1; index <= 8; index += 1) {
    expect(exported).toContain(`tool ${index} finished`);
  }
  expect(pane.content).toContain("8 events");
  expect(pane.content).not.toContain("tool 1 finished");
  expect(pane.content).toContain("tool 8 finished");
});

it("does not attach an active turn trace to a queued operator echo", () => {
  vi.useFakeTimers();
  const { controller, transcriptExportPath } = harness();
  controller.setLiveResponse("Doolittle", "working", {
    kind: "assistant",
    pending: true,
  });
  controller.pushLiveToolEvent("tool 1 finished");

  controller.pushResponseEntry("You", "queued follow-up", {
    captureToolTrace: false,
  });
  controller.pushResponseEntry("Doolittle", "final answer");
  vi.advanceTimersByTime(500);

  const exported = readFileSync(transcriptExportPath, "utf8");
  expect(exported.indexOf("queued follow-up")).toBeLessThan(
    exported.indexOf("final answer"),
  );
  expect(exported.indexOf("tool 1 finished")).toBeGreaterThan(
    exported.indexOf("final answer"),
  );
});

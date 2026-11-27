import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AppContext } from "@doolittle/agent/runtime/bootstrap";
import { afterEach, expect, it } from "vitest";
import {
  type ResponseTranscriptEntry,
  renderPlainTranscript,
  renderResponseTranscript,
} from "../../apps/cli/src/cli/transcript-renderer/index";
import { createTuiTranscriptController } from "../../apps/cli/src/cli/tui-transcript/controller";

function longEntry(lines = 60): ResponseTranscriptEntry {
  return {
    label: "Command Result",
    body: Array.from({ length: lines }, (_, index) => `line ${index + 1}`).join(
      "\n",
    ),
    at: "12:00:00",
    kind: "command",
  };
}

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

it("folds long viewport bodies to a tail preview while export retains every line", () => {
  const entry = longEntry();
  const viewport = renderResponseTranscript([entry]);
  const exported = renderPlainTranscript([entry]);

  expect(viewport).not.toMatch(/(^|\n)line 1\n/);
  expect(viewport).toContain("line 60");
  expect(viewport).toContain("48 more lines");
  expect(exported).toContain("line 1");
  expect(exported).toContain("line 60");
});

it("expands folded viewport output from the transcript pane key affordance", () => {
  const dir = mkdtempSync(join(tmpdir(), "tui-fold-"));
  dirs.push(dir);
  let expandOutput: (() => void) | undefined;
  const pane = {
    content: "",
    setContent(content: string) {
      this.content = content;
    },
    getScrollPerc: () => 100,
    setScrollPerc: () => {},
    key(keys: string | string[], listener: () => void) {
      if (Array.isArray(keys) && keys.includes("+")) {
        expandOutput = listener;
      }
    },
  };
  const controller = createTuiTranscriptController({
    context: {
      config: { agentName: "Doolittle" },
      services: { runController: { getActive: () => undefined } },
    } as unknown as AppContext,
    state: { activeSessionId: "session", notices: [] },
    responsePane: pane,
    transcriptExportPath: join(dir, "transcript.txt"),
    appendActivity: () => {},
    pushNotice: () => {},
    scheduleRefreshPanels: () => {},
    truncate: (text, maxLength) => text.slice(0, maxLength),
    isBusy: () => false,
    canCopyToClipboard: false,
  });

  controller.pushResponseEntry("Command Result", longEntry().body);
  expect(pane.content).not.toMatch(/(^|\n)line 1\n/);
  expect(expandOutput).toBeDefined();

  expandOutput?.();
  expect(pane.content).toContain("line 1");
  expect(pane.content).toContain("line 60");
});

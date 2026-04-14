import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTuiTranscriptController } from "@/cli/tui-transcript/controller";
import type { AppContext } from "@/runtime/bootstrap";

function createContext(agentName = "Doolittle"): AppContext {
  return {
    config: {
      agentName,
    },
    services: {
      runController: {
        getActive: () => null,
      },
    },
  } as unknown as AppContext;
}

function createResponsePane() {
  let content = "";
  let scrollPerc = 100;
  return {
    setContent(next: string) {
      content = next;
    },
    getScrollPerc() {
      return scrollPerc;
    },
    setScrollPerc(next: number) {
      scrollPerc = next;
    },
    readContent() {
      return content;
    },
  };
}

describe("createTuiTranscriptController", () => {
  it("keeps live tool activity attached to the current pending response", () => {
    const responsePane = createResponsePane();
    const transcriptExportPath = join(
      mkdtempSync(join(tmpdir(), "doolittle-tui-transcript-")),
      "transcript.txt",
    );

    const controller = createTuiTranscriptController({
      context: createContext(),
      state: {
        activeSessionId: "cli:test",
        notices: [],
      },
      responsePane,
      transcriptExportPath,
      appendActivity: () => {},
      pushNotice: () => {},
      scheduleRefreshPanels: () => {},
      truncate: (text) => text,
      isBusy: () => true,
      canCopyToClipboard: false,
    });

    controller.setLiveResponse("Doolittle", "Working", {
      kind: "assistant",
      pending: true,
    });
    controller.pushLiveToolEvent("shell npm test → 0");

    expect(controller.getLiveResponse()).toMatchObject({
      label: "Doolittle",
      body: "Working",
      pending: true,
    });
    expect(controller.getLiveResponse()?.liveActivity?.length).toBe(1);
    expect(responsePane.readContent()).toContain("Working");
  });

  it("exports the transcript and records a status notice", () => {
    const responsePane = createResponsePane();
    const transcriptExportPath = join(
      mkdtempSync(join(tmpdir(), "doolittle-tui-transcript-")),
      "transcript.txt",
    );
    const notices: string[] = [];
    const activity: string[] = [];

    const controller = createTuiTranscriptController({
      context: createContext(),
      state: {
        activeSessionId: "cli:test",
        notices: [],
      },
      responsePane,
      transcriptExportPath,
      appendActivity: (_kind, message) => {
        activity.push(message);
      },
      pushNotice: (_kind, message) => {
        notices.push(message);
      },
      scheduleRefreshPanels: () => {},
      truncate: (text) => text,
      isBusy: () => false,
      canCopyToClipboard: false,
    });

    controller.pushResponseEntry("Helm Ready", "Welcome aboard.");
    controller.exportTranscript();

    expect(readFileSync(transcriptExportPath, "utf8")).toContain(
      "Welcome aboard.",
    );
    expect(notices[0]).toContain(transcriptExportPath);
    expect(activity[0]).toContain("Transcript saved");
  });

  it("clears live and persisted responses on reset", () => {
    const responsePane = createResponsePane();
    const transcriptExportPath = join(
      mkdtempSync(join(tmpdir(), "doolittle-tui-transcript-")),
      "transcript.txt",
    );

    const controller = createTuiTranscriptController({
      context: createContext(),
      state: {
        activeSessionId: "cli:test",
        notices: [],
      },
      responsePane,
      transcriptExportPath,
      appendActivity: () => {},
      pushNotice: () => {},
      scheduleRefreshPanels: () => {},
      truncate: (text) => text,
      isBusy: () => false,
      canCopyToClipboard: false,
    });

    controller.pushResponseEntry("Helm Ready", "Welcome aboard.");
    controller.setLiveResponse("Doolittle", "Still working", {
      kind: "assistant",
      pending: true,
    });

    controller.resetResponses();

    expect(controller.getLiveResponse()).toBeUndefined();
    expect(responsePane.readContent()).not.toContain("Welcome aboard.");
    expect(responsePane.readContent()).toContain("Responses");
  });
});

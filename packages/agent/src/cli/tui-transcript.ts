import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { decorateLiveActivity } from "@/cli/activity-chrome";
import type { CliExecutionResult, CliState } from "@/cli/execution";
import { formatRecoverableProviderError } from "@/cli/runtime-errors";
import {
  type ResponseTranscriptEntry,
  renderPlainTranscript,
  renderResponseTranscript,
} from "@/cli/transcript-renderer";
import type { AppContext } from "@/runtime/bootstrap";
import { formatElapsedMs, getRunElapsedMs } from "@/runtime/run-progress";

interface TuiTranscriptOptions {
  context: AppContext;
  state: CliState;
  responsePane: {
    setContent(content: string): void;
    getScrollPerc(): number;
    setScrollPerc(percent: number): void;
  };
  transcriptExportPath: string;
  appendActivity: (
    kind: string,
    message: string,
    tone: CliExecutionResult["tone"],
  ) => void;
  pushNotice: (kind: "context" | "skills" | "status", message: string) => void;
  scheduleRefreshPanels: (delayMs?: number) => void;
  truncate: (text: string, maxLength: number) => string;
  isBusy: () => boolean;
  canCopyToClipboard: boolean;
}

interface TuiTranscriptController {
  exportTranscript(): void;
  pushResponseEntry(
    label: string,
    body: string,
    options?: { elapsed?: string },
  ): void;
  refreshLiveResponse(): void;
  setLiveResponse(
    label: string,
    body: string,
    options?: { kind?: ResponseTranscriptEntry["kind"]; pending?: boolean },
  ): void;
  pushLiveToolEvent(detail: string): void;
  resetResponses(): void;
  clearLiveResponse(): void;
  getLiveResponse(): ResponseTranscriptEntry | undefined;
}

function nowStamp(): string {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function createTuiTranscriptController(
  options: TuiTranscriptOptions,
): TuiTranscriptController {
  const {
    context,
    state,
    responsePane,
    transcriptExportPath,
    appendActivity,
    pushNotice,
    scheduleRefreshPanels,
    truncate,
    isBusy,
    canCopyToClipboard,
  } = options;
  const responseHistory: ResponseTranscriptEntry[] = [];
  let liveResponse: ResponseTranscriptEntry | undefined;
  let liveToolTrail: string[] = [];

  const pendingRunLabel = (baseLabel: string): string => {
    const activeRun = context.services.runController.getActive(
      state.activeSessionId,
    );
    if (!isBusy() || !activeRun) {
      return baseLabel;
    }

    const markers: string[] = [activeRun.status];
    const elapsed = formatElapsedMs(getRunElapsedMs(activeRun));
    if (elapsed) {
      markers.push(elapsed);
    }
    if (activeRun.observedActionCount > 0) {
      markers.push(
        `${activeRun.observedActionCount} step${activeRun.observedActionCount === 1 ? "" : "s"}`,
      );
    }
    if (activeRun.activeAction) {
      markers.push(truncate(activeRun.activeAction, 24));
    } else if (
      activeRun.activeStream &&
      activeRun.activeStream !== "assistant"
    ) {
      markers.push(truncate(activeRun.activeStream, 24));
    } else if (activeRun.statusDetail) {
      markers.push(truncate(activeRun.statusDetail, 24));
    }

    return `${baseLabel} · ${markers.join(" · ")}`;
  };

  const baseLabelForLiveKind = (
    kind: ResponseTranscriptEntry["kind"] | undefined,
  ): string => {
    if (kind === "shell") {
      return "Shell";
    }
    if (kind === "command") {
      return "Command Result";
    }
    if (kind === "user") {
      return "You";
    }
    if (kind === "system") {
      return "System";
    }
    return context.config.agentName;
  };

  const renderResponsePane = () => {
    const pinnedToBottom = responsePane.getScrollPerc() >= 96;
    responsePane.setContent(
      renderResponseTranscript(responseHistory, liveResponse),
    );
    try {
      writeFileSync(
        transcriptExportPath,
        `${renderPlainTranscript(responseHistory, liveResponse)}\n`,
        "utf8",
      );
    } catch {
      // Best effort only.
    }
    if (pinnedToBottom) {
      responsePane.setScrollPerc(100);
    }
  };

  const exportTranscript = () => {
    const transcript = `${renderPlainTranscript(responseHistory, liveResponse)}\n`;
    try {
      writeFileSync(transcriptExportPath, transcript, "utf8");
    } catch (error) {
      appendActivity(
        "copy",
        `Could not write transcript export: ${formatRecoverableProviderError(error)}`,
        "warning",
      );
      scheduleRefreshPanels(0);
      return;
    }

    let copied = false;
    try {
      if (
        canCopyToClipboard &&
        typeof Bun.which === "function" &&
        Bun.which("pbcopy")
      ) {
        const result = spawnSync("pbcopy", [], {
          input: transcript,
          stdio: ["pipe", "ignore", "ignore"],
        });
        copied = result.status === 0;
      }
    } catch {
      copied = false;
    }

    const detail = copied
      ? `Transcript copied to clipboard and saved to ${transcriptExportPath}.`
      : `Transcript saved to ${transcriptExportPath}.`;
    pushNotice("status", detail);
    appendActivity("copy", detail, copied ? "success" : "info");
    scheduleRefreshPanels(0);
  };

  const setLiveResponse = (
    label: string,
    body: string,
    options?: { kind?: ResponseTranscriptEntry["kind"]; pending?: boolean },
  ) => {
    liveResponse = {
      label: options?.pending ? pendingRunLabel(label) : label,
      body: body.trim(),
      at: nowStamp(),
      kind: options?.kind,
      pending: options?.pending,
      liveActivity:
        liveToolTrail.length > 0 ? liveToolTrail.slice(-4) : undefined,
    };
    renderResponsePane();
  };

  const refreshLiveResponse = () => {
    if (!liveResponse) {
      return;
    }
    setLiveResponse(
      baseLabelForLiveKind(liveResponse.kind),
      liveResponse.body,
      {
        kind: liveResponse.kind,
        pending: liveResponse.pending,
      },
    );
  };

  return {
    exportTranscript,
    pushResponseEntry(label, body, options) {
      responseHistory.push({
        label,
        body,
        at: nowStamp(),
        elapsed: options?.elapsed,
        kind:
          label === "You"
            ? "user"
            : label === "Shell"
              ? "shell"
              : label === "Command" || label === "Command Result"
                ? "command"
                : label === "Helm Ready"
                  ? "system"
                  : "assistant",
      });
      if (responseHistory.length > 48) {
        responseHistory.splice(0, responseHistory.length - 48);
      }
      liveToolTrail = [];
      liveResponse = undefined;
      renderResponsePane();
    },
    setLiveResponse,
    pushLiveToolEvent(detail) {
      const nextLine = decorateLiveActivity(detail);
      if (liveToolTrail.at(-1) === nextLine) {
        return;
      }
      liveToolTrail.push(nextLine);
      if (liveToolTrail.length > 6) {
        liveToolTrail = liveToolTrail.slice(-6);
      }
      refreshLiveResponse();
    },
    refreshLiveResponse,
    resetResponses() {
      responseHistory.length = 0;
      liveResponse = undefined;
      liveToolTrail = [];
      renderResponsePane();
    },
    clearLiveResponse() {
      liveResponse = undefined;
    },
    getLiveResponse() {
      return liveResponse;
    },
  };
}

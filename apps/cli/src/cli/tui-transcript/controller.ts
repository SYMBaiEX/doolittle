import { decorateLiveActivity } from "../activity-chrome";
import type { ResponseTranscriptEntry } from "../transcript-renderer/index";
import { exportTranscriptArtifact } from "./export";
import { nowStamp, resolveTranscriptEntryKind } from "./labels";
import { baseLiveLabel, buildLiveResponse } from "./live-response";
import { renderTranscriptPane } from "./rendering";
import type { TuiTranscriptController, TuiTranscriptOptions } from "./types";

export function createTuiTranscriptController(
  options: TuiTranscriptOptions,
): TuiTranscriptController {
  const responseHistory: ResponseTranscriptEntry[] = [];
  let liveResponse: ResponseTranscriptEntry | undefined;
  let liveToolTrail: string[] = [];

  const renderResponsePane = () => {
    renderTranscriptPane({
      responsePane: options.responsePane,
      responseHistory,
      liveResponse,
      transcriptExportPath: options.transcriptExportPath,
    });
  };

  const setLiveResponse = (
    label: string,
    body: string,
    next?: { kind?: ResponseTranscriptEntry["kind"]; pending?: boolean },
  ) => {
    liveResponse = buildLiveResponse({
      label,
      body,
      liveToolTrail,
      options,
      kind: next?.kind,
      pending: next?.pending,
    });
    renderResponsePane();
  };

  const refreshLiveResponse = () => {
    if (!liveResponse) {
      return;
    }
    setLiveResponse(
      baseLiveLabel(options.context.config.agentName, liveResponse.kind),
      liveResponse.body,
      {
        kind: liveResponse.kind,
        pending: liveResponse.pending,
      },
    );
  };

  return {
    exportTranscript() {
      void exportTranscriptArtifact({
        transcriptExportPath: options.transcriptExportPath,
        responseHistory,
        liveResponse,
        appendActivity: options.appendActivity,
        pushNotice: options.pushNotice,
        scheduleRefreshPanels: options.scheduleRefreshPanels,
        canCopyToClipboard: options.canCopyToClipboard,
      });
    },
    pushResponseEntry(label, body, entryOptions) {
      // Entries are retained for the whole session: the transcript export and
      // viewport scrollback must both reach back to the first message. The
      // previous 48-entry splice silently destroyed older history everywhere.
      const captureToolTrace = entryOptions?.captureToolTrace !== false;
      const toolTrace =
        captureToolTrace && liveToolTrail.length > 0
          ? [...liveToolTrail]
          : undefined;
      responseHistory.push({
        label,
        body,
        at: nowStamp(),
        elapsed: entryOptions?.elapsed,
        kind: entryOptions?.kind ?? resolveTranscriptEntryKind(label),
        tone: entryOptions?.tone,
        status: entryOptions?.status,
        toolTrace,
      });
      if (captureToolTrace) {
        liveToolTrail = [];
        liveResponse = undefined;
      }
      renderResponsePane();
    },
    setLiveResponse,
    pushLiveToolEvent(detail) {
      const nextLine = decorateLiveActivity(detail);
      if (liveToolTrail.at(-1) === nextLine) {
        return;
      }
      liveToolTrail.push(nextLine);
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

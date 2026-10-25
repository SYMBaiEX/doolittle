import type { AppContext } from "@doolittle/agent/runtime/bootstrap";
import type { CliExecutionResult, CliState } from "../execution/index";
import type { ResponseTranscriptEntry } from "../transcript-renderer/index";

export interface TuiResponsePane {
  setContent(content: string): void;
  getScrollPerc(): number;
  setScrollPerc(percent: number): void;
}

export interface TuiTranscriptOptions {
  context: AppContext;
  state: CliState;
  responsePane: TuiResponsePane;
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

export interface TuiTranscriptController {
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

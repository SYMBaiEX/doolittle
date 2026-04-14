import { writeFileSync } from "node:fs";
import type { ResponseTranscriptEntry } from "@/cli/transcript-renderer";
import {
  renderPlainTranscript,
  renderResponseTranscript,
} from "@/cli/transcript-renderer";

type TuiResponsePane = {
  setContent(content: string): void;
  getScrollPerc(): number;
  setScrollPerc(percent: number): void;
};

export function renderTranscriptPane(input: {
  responsePane: TuiResponsePane;
  responseHistory: ResponseTranscriptEntry[];
  liveResponse: ResponseTranscriptEntry | undefined;
  transcriptExportPath: string;
}): void {
  const pinnedToBottom = input.responsePane.getScrollPerc() >= 96;
  input.responsePane.setContent(
    renderResponseTranscript(input.responseHistory, input.liveResponse),
  );
  try {
    writeFileSync(
      input.transcriptExportPath,
      `${renderPlainTranscript(input.responseHistory, input.liveResponse)}\n`,
      "utf8",
    );
  } catch {
    // Best effort only.
  }
  if (pinnedToBottom) {
    input.responsePane.setScrollPerc(100);
  }
}

export function writeTranscriptExport(
  transcriptExportPath: string,
  responseHistory: ResponseTranscriptEntry[],
  liveResponse: ResponseTranscriptEntry | undefined,
): string {
  const transcript = `${renderPlainTranscript(responseHistory, liveResponse)}\n`;
  writeFileSync(transcriptExportPath, transcript, "utf8");
  return transcript;
}

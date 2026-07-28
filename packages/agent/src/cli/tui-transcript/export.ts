import { formatRecoverableProviderError } from "@/cli/runtime-errors";
import type { ResponseTranscriptEntry } from "@/cli/transcript-renderer";
import { runTextProcess } from "@/services/process-execution";
import { writeTranscriptExport } from "./rendering";

export async function exportTranscriptArtifact(input: {
  transcriptExportPath: string;
  responseHistory: ResponseTranscriptEntry[];
  liveResponse: ResponseTranscriptEntry | undefined;
  appendActivity: (
    kind: string,
    message: string,
    tone: "info" | "warning" | "success",
  ) => void;
  pushNotice: (kind: "context" | "skills" | "status", message: string) => void;
  scheduleRefreshPanels: (delayMs?: number) => void;
  canCopyToClipboard: boolean;
}): Promise<void> {
  try {
    writeTranscriptExport(
      input.transcriptExportPath,
      input.responseHistory,
      input.liveResponse,
    );
  } catch (error) {
    input.appendActivity(
      "copy",
      `Could not write transcript export: ${formatRecoverableProviderError(error)}`,
      "warning",
    );
    input.scheduleRefreshPanels(0);
    return;
  }

  let copied = false;
  try {
    if (input.canCopyToClipboard && process.platform === "darwin") {
      const result = await runTextProcess(
        "/bin/sh",
        [
          "-c",
          'exec pbcopy < "$1"',
          "doolittle-transcript-copy",
          input.transcriptExportPath,
        ],
        {
          timeoutMs: 5_000,
          toolName: "doolittle.tui.pbcopy",
        },
      );
      copied = result.exitCode === 0;
    }
  } catch {
    copied = false;
  }

  const detail = copied
    ? `Transcript copied to clipboard and saved to ${input.transcriptExportPath}.`
    : `Transcript saved to ${input.transcriptExportPath}.`;
  input.pushNotice("status", detail);
  input.appendActivity("copy", detail, copied ? "success" : "info");
  input.scheduleRefreshPanels(0);
}

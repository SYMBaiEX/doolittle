import { spawnSync } from "node:child_process";
import { formatRecoverableProviderError } from "@/cli/runtime-errors";
import type { ResponseTranscriptEntry } from "@/cli/transcript-renderer";
import { writeTranscriptExport } from "./rendering";

export function exportTranscriptArtifact(input: {
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
}): void {
  let transcript: string;
  try {
    transcript = writeTranscriptExport(
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
    if (
      input.canCopyToClipboard &&
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
    ? `Transcript copied to clipboard and saved to ${input.transcriptExportPath}.`
    : `Transcript saved to ${input.transcriptExportPath}.`;
  input.pushNotice("status", detail);
  input.appendActivity("copy", detail, copied ? "success" : "info");
  input.scheduleRefreshPanels(0);
}

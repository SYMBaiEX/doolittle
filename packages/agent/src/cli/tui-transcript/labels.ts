import type { CliExecutionResult, CliState } from "@/cli/execution";
import type { ResponseTranscriptEntry } from "@/cli/transcript-renderer";
import type { AppContext } from "@/runtime/bootstrap";
import { formatElapsedMs, getRunElapsedMs } from "@/runtime/run-progress";

export function nowStamp(): string {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function createPendingRunLabel(input: {
  baseLabel: string;
  context: AppContext;
  state: CliState;
  truncate: (text: string, maxLength: number) => string;
  isBusy: boolean;
}): string {
  const activeRun = input.context.services.runController.getActive(
    input.state.activeSessionId,
  );
  if (!input.isBusy || !activeRun) {
    return input.baseLabel;
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
    markers.push(input.truncate(activeRun.activeAction, 24));
  } else if (activeRun.activeStream && activeRun.activeStream !== "assistant") {
    markers.push(input.truncate(activeRun.activeStream, 24));
  } else if (activeRun.statusDetail) {
    markers.push(input.truncate(activeRun.statusDetail, 24));
  }

  return `${input.baseLabel} · ${markers.join(" · ")}`;
}

export function baseLabelForLiveKind(
  agentName: string,
  kind: ResponseTranscriptEntry["kind"] | undefined,
): string {
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
  return agentName;
}

export function resolveTranscriptEntryKind(
  label: string,
): CliExecutionResult["tone"] extends never
  ? never
  : ResponseTranscriptEntry["kind"] {
  if (label === "You") {
    return "user";
  }
  if (label === "Shell") {
    return "shell";
  }
  if (label === "Command" || label === "Command Result") {
    return "command";
  }
  if (label === "Helm Ready") {
    return "system";
  }
  return "assistant";
}

import {
  type CliExecutionResult,
  getCliResultStatus,
} from "@/cli/execution/types";
import type { CliJobRecord } from "@/cli/jobs";
import type { CliTurnEvent } from "@/cli/turn-events";
import { encodeCliTurnEvent } from "@/cli/turn-events";
import type { StaticResult } from "./static-prompts";

export function writeStderrLine(message: string): void {
  process.stderr.write(`${message}\n`);
}

export function printOneShotResult(
  result: CliExecutionResult,
  json: boolean,
): void {
  if (json) {
    console.log(
      JSON.stringify({
        ok: getCliResultStatus(result) === "completed",
        tone: result.tone ?? "info",
        text: result.text,
      }),
    );
    return;
  }

  if (result.text) {
    console.log(result.text);
  }
}

export function printCliJobRecord(
  job: CliJobRecord | undefined,
  json: boolean,
  renderSummary: (job: CliJobRecord) => string,
): void {
  if (!job) {
    return;
  }

  if (json) {
    console.log(JSON.stringify(job));
    return;
  }

  console.log(renderSummary(job));
}

export async function emitStaticPromptEvents(
  prompt: string,
  result: StaticResult,
  options?: {
    sessionId?: string;
    onEvent?: (event: CliTurnEvent) => void;
  },
): Promise<void> {
  const timestamp = new Date().toISOString();
  const sessionId = options?.sessionId?.trim() || `static:${Date.now()}`;
  const emit = (event: CliTurnEvent) => {
    options?.onEvent?.(event);
    process.stdout.write(encodeCliTurnEvent(event));
  };
  emit({
    type: "start",
    timestamp,
    sessionId,
    command: prompt,
  });
  emit({
    type: "result",
    timestamp: new Date().toISOString(),
    text: result.text,
    tone: result.tone ?? "info",
    shouldExit: result.shouldExit ?? false,
  });
  emit({
    type: "completed",
    timestamp: new Date().toISOString(),
    status: getCliResultStatus(result),
  });
}

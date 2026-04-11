import type { CliJobRecord } from "@/cli/jobs";
import { encodeCliTurnEvent } from "@/cli/turn-events";
import type { StaticResult } from "./static-prompts";

export function writeStderrLine(message: string): void {
  process.stderr.write(`${message}\n`);
}

export function printOneShotResult(result: StaticResult, json: boolean): void {
  if (json) {
    console.log(
      JSON.stringify({
        ok: !result.shouldExit,
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
  },
): Promise<void> {
  const timestamp = new Date().toISOString();
  const sessionId = options?.sessionId?.trim() || `static:${Date.now()}`;
  process.stdout.write(
    encodeCliTurnEvent({
      type: "start",
      timestamp,
      sessionId,
      command: prompt,
    }),
  );
  process.stdout.write(
    encodeCliTurnEvent({
      type: "result",
      timestamp: new Date().toISOString(),
      text: result.text,
      tone: result.tone ?? "info",
      shouldExit: result.shouldExit ?? false,
    }),
  );
  process.stdout.write(
    encodeCliTurnEvent({
      type: "completed",
      timestamp: new Date().toISOString(),
      status: result.shouldExit ? "cancelled" : "completed",
    }),
  );
}

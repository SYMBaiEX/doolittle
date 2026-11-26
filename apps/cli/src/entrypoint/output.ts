import {
  type CliExecutionResult,
  getCliResultStatus,
} from "../cli/execution/types";
import type { CliTurnEvent } from "../cli/turn-events";
import { encodeCliTurnEvent } from "../cli/turn-events";
import { writeOwnedStdout } from "./machine-stdout-firewall";

export function writeStderrLine(message: string): void {
  process.stderr.write(`${message}\n`);
}

export function writeStdout(message: string): Promise<void> {
  return writeOwnedStdout(message);
}

export async function printOneShotResult(
  result: CliExecutionResult,
  json: boolean,
): Promise<void> {
  if (json) {
    return writeStdout(
      `${JSON.stringify({
        ok: getCliResultStatus(result) === "completed",
        tone: result.tone ?? "info",
        text: result.text,
      })}\n`,
    );
  }

  if (result.text) await writeStdout(`${result.text}\n`);
}

export async function emitStaticPromptEvents(
  prompt: string,
  result: CliExecutionResult,
  options?: {
    sessionId?: string;
    onEvent?: (event: CliTurnEvent) => void | Promise<void>;
  },
): Promise<void> {
  const timestamp = new Date().toISOString();
  const sessionId = options?.sessionId?.trim() || `static:${Date.now()}`;
  const emit =
    options?.onEvent ?? ((event) => writeStdout(encodeCliTurnEvent(event)));
  await emit({
    type: "start",
    timestamp,
    sessionId,
    command: prompt,
  });
  await emit({
    type: "result",
    timestamp: new Date().toISOString(),
    text: result.text,
    tone: result.tone ?? "info",
    shouldExit: result.shouldExit ?? false,
  });
  await emit({
    type: "completed",
    timestamp: new Date().toISOString(),
    status: getCliResultStatus(result),
  });
}

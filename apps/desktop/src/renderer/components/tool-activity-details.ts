import { asRecordOrUndefined } from "@elizaos/shared/type-guards";
import { runActionLabel } from "../chat/models";
import type { ToolActivity, ToolActivityStatus } from "./message-output";

const SHELL_ACTIONS = new Set([
  "SHELL",
  "SHELL_COMMAND",
  "RUN_IN_TERMINAL",
  "TERMINAL_SHELL",
]);

function normalizedActionName(action: string): string {
  return action.toUpperCase().replace(/[\s-]+/gu, "_");
}

export function toolActionLabel(action: string): string {
  const name = normalizedActionName(action);
  return SHELL_ACTIONS.has(name) ? "Shell command" : runActionLabel(name);
}

function asText(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function durationText(value: number): string {
  if (value < 1_000) return `${Math.round(value)} ms`;
  return `${Number((value / 1_000).toFixed(1))} s`;
}

export interface ToolDetails {
  label: string;
  target?: string;
  command?: string;
  stdout?: string;
  stderr?: string;
  diff?: string;
  exitCode?: number;
  duration?: string;
  timedOut: boolean;
  truncated: boolean;
  status: ToolActivityStatus;
}

/** Only inspect displayable evidence already present in the transcript. */
export function toolActivityDetails(activity: ToolActivity): ToolDetails {
  const name = normalizedActionName(activity.name);
  const input = asRecordOrUndefined(activity.input);
  const output = asRecordOrUndefined(activity.output);
  const data = asRecordOrUndefined(output?.data) ?? output;
  const commandData = asRecordOrUndefined(data?.commandResult) ?? data;
  const shell =
    SHELL_ACTIONS.has(name) ||
    typeof commandData?.stdout === "string" ||
    typeof commandData?.stderr === "string";
  const command = shell
    ? (asText(input?.command) ??
      asText(commandData?.command) ??
      asText(activity.input))
    : undefined;
  const target =
    command ??
    [
      activity.input,
      input?.query,
      input?.pattern,
      input?.path,
      input?.filePath,
      input?.url,
      input?.workingDirectory,
      input?.root,
    ]
      .find(
        (value): value is string =>
          typeof value === "string" && Boolean(value.trim()),
      )
      ?.trim();
  const exit = commandData?.exitCode;
  const exitCode =
    shell && typeof exit === "number" && Number.isInteger(exit)
      ? exit
      : undefined;
  const elapsed = commandData?.durationMs ?? output?.durationMs;
  const duration =
    typeof elapsed === "number" && Number.isFinite(elapsed) && elapsed >= 0
      ? durationText(elapsed)
      : undefined;
  const timedOut = shell && commandData?.timedOut === true;
  const truncated = commandData?.truncated === true;
  const diff =
    asText(data?.diff) ?? asText(data?.patch) ?? asText(input?.patch);
  return {
    label: toolActionLabel(name) || "Agent tool",
    target,
    command,
    stdout: shell ? asText(commandData?.stdout) : undefined,
    stderr: shell ? asText(commandData?.stderr) : undefined,
    diff,
    exitCode,
    duration,
    timedOut,
    truncated,
    status:
      timedOut || (exitCode !== undefined && exitCode !== 0)
        ? "error"
        : activity.status,
  };
}

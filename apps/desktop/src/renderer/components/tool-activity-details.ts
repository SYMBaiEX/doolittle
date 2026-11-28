import { asRecordOrUndefined } from "@elizaos/shared/type-guards";
import { runActionLabel } from "../chat/models";
import type { ToolActivity, ToolActivityStatus } from "./message-output";

const SHELL_ACTIONS = new Set([
  "SHELL",
  "SHELL_COMMAND",
  "RUN_IN_TERMINAL",
  "TERMINAL_SHELL",
]);

// ActionResult text blobs can carry megabytes of stream output; keep only the
// newest tail for streams and a bounded head for result/error text.
const MAX_STREAM_CHARACTERS = 8_192;
const MAX_TEXT_CHARACTERS = 16_384;
const TRUNCATION_NOTE = "… (truncated)";

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

function firstText(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

/** ActionResult payloads sometimes arrive serialized as a JSON string. */
function parseJsonRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "string") return asRecordOrUndefined(value);
  if (!value.trimStart().startsWith("{")) return undefined;
  try {
    return asRecordOrUndefined(JSON.parse(value));
  } catch {
    return undefined;
  }
}

function durationText(value: number): string {
  if (value < 1_000) return `${Math.round(value)} ms`;
  return `${Number((value / 1_000).toFixed(1))} s`;
}

interface BoundedText {
  clipped: boolean;
  text?: string;
}

function boundTail(text: string | undefined, limit: number): BoundedText {
  if (text === undefined) return { clipped: false };
  if (text.length <= limit) return { text, clipped: false };
  return { text: `${TRUNCATION_NOTE}\n${text.slice(-limit)}`, clipped: true };
}

function boundHead(text: string | undefined, limit: number): BoundedText {
  if (text === undefined) return { clipped: false };
  if (text.length <= limit) return { text, clipped: false };
  return { text: `${text.slice(0, limit)}\n${TRUNCATION_NOTE}`, clipped: true };
}

interface ShellResultText {
  command?: string;
  exitCode?: number;
  incomplete: boolean;
  stderr?: string;
  stdout?: string;
  timedOut?: boolean;
  timeoutMs?: number;
}

function lineValue(text: string, name: string): string | undefined {
  return new RegExp(`^${name}:[^\\S\\r\\n]*(\\S.*)$`, "imu")
    .exec(text)?.[1]
    ?.trim();
}

/** A stream section runs from its `NAME:` header line to the next header. */
function sectionBody(
  text: string,
  name: string,
  followers: readonly string[],
): string | undefined {
  const header = new RegExp(`^${name}:[^\\S\\r\\n]*`, "imu").exec(text);
  if (!header) return undefined;
  const start = header.index + header[0].length;
  let end = text.length;
  for (const follower of followers) {
    const next = new RegExp(`^${follower}:`, "imu").exec(text.slice(start));
    if (next) end = Math.min(end, start + next.index);
  }
  return text
    .slice(start, end)
    .replace(/^\r?\n/u, "")
    .trimEnd();
}

/**
 * Recover the terminal sections an SDK shell action reports inside an
 * ActionResult `text` blob when no structured commandResult is present:
 *
 *   Command: cd /path && pnpm install
 *   Exit code: 124
 *   Timed out: yes (30000 ms limit); output below is incomplete
 *   STDOUT:
 *   <text>
 *   STDERR:
 *   <text>
 */
function parseShellResultText(text: string): ShellResultText | undefined {
  if (!text.trim()) return undefined;
  const parsed: ShellResultText = { incomplete: false };
  let matched = false;

  const command = lineValue(text, "Command");
  if (command) {
    parsed.command = command;
    matched = true;
  }
  const exit = lineValue(text, "Exit code");
  if (exit !== undefined) {
    const code = Number.parseInt(exit, 10);
    if (Number.isFinite(code)) {
      parsed.exitCode = code;
      matched = true;
    }
  }
  const timed = lineValue(text, "Timed out");
  if (timed !== undefined) {
    matched = true;
    parsed.timedOut = /^y/iu.test(timed);
    const limit = /(\d[\d,]*)\s*ms/iu.exec(timed)?.[1];
    if (limit) {
      const ms = Number(limit.replace(/,/gu, ""));
      if (Number.isFinite(ms) && ms >= 0) parsed.timeoutMs = ms;
    }
    parsed.incomplete = /incomplete|truncated/iu.test(timed);
  }
  const stdout = sectionBody(text, "STDOUT", ["STDERR"]);
  if (stdout !== undefined) {
    parsed.stdout = stdout;
    matched = true;
  }
  const stderr = sectionBody(text, "STDERR", [
    "Command",
    "Exit code",
    "Timed out",
    "STDOUT",
  ]);
  if (stderr !== undefined) {
    parsed.stderr = stderr;
    matched = true;
  }
  return matched ? parsed : undefined;
}

export interface ToolDetails {
  label: string;
  target?: string;
  command?: string;
  stdout?: string;
  stderr?: string;
  diff?: string;
  output?: string;
  error?: string;
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
  const output = parseJsonRecord(activity.output);
  const data = asRecordOrUndefined(output?.data) ?? output;
  const commandData = asRecordOrUndefined(data?.commandResult) ?? data;
  const shell =
    SHELL_ACTIONS.has(name) ||
    typeof commandData?.stdout === "string" ||
    typeof commandData?.stderr === "string";
  const resultText = firstText(
    output?.text,
    data?.text,
    data?.content,
    data?.result,
    data?.value,
    output?.value,
    activity.output,
  );
  // ActionResult.userFacingText is the upstream field explicitly authored for
  // user display (the same contract the run projector already trusts for
  // failure prose). The web-search plugin, for example, keeps the raw provider
  // JSON in `text` while authoring markdown source rows in `userFacingText`.
  const userFacingText = firstText(output?.userFacingText);

  // SDK shell actions often report an ActionResult text blob instead of
  // structured commandResult fields; recover the sections it carries.
  let parsed: ShellResultText | undefined;
  if (shell) {
    for (const candidate of [
      output?.text,
      data?.text,
      commandData?.text,
      data?.commandResult,
      activity.output,
      activity.error,
    ]) {
      if (typeof candidate !== "string") continue;
      parsed = parseShellResultText(candidate);
      if (parsed) break;
    }
  }

  const command = shell
    ? (asText(input?.command) ??
      asText(commandData?.command) ??
      parsed?.command ??
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
      data?.path,
      data?.filePath,
      Array.isArray(data?.paths)
        ? data?.paths.find((path): path is string => typeof path === "string")
        : undefined,
    ]
      .find(
        (value): value is string =>
          typeof value === "string" && Boolean(value.trim()),
      )
      ?.trim();
  const exit = commandData?.exitCode;
  const exitCode = shell
    ? typeof exit === "number" && Number.isInteger(exit)
      ? exit
      : parsed?.exitCode
    : undefined;
  const elapsed =
    commandData?.durationMs ?? output?.durationMs ?? parsed?.timeoutMs;
  const duration =
    typeof elapsed === "number" && Number.isFinite(elapsed) && elapsed >= 0
      ? durationText(elapsed)
      : undefined;
  const timedOut =
    shell && (commandData?.timedOut === true || parsed?.timedOut === true);
  const diff =
    asText(data?.diff) ?? asText(data?.patch) ?? asText(input?.patch);

  const stdoutTail = boundTail(parsed?.stdout, MAX_STREAM_CHARACTERS);
  const stderrTail = boundTail(parsed?.stderr, MAX_STREAM_CHARACTERS);
  const stdout = shell
    ? (asText(commandData?.stdout) ?? stdoutTail.text)
    : undefined;
  const stderr = shell
    ? (asText(commandData?.stderr) ?? stderrTail.text)
    : undefined;

  const failed =
    activity.status === "error" ||
    output?.success === false ||
    Boolean(activity.error);
  const hasStreams = stdout !== undefined || stderr !== undefined;
  // Successful results prefer the explicitly user-authored field; failures
  // keep diagnostic text in the detail surface because the authored failure
  // prose is already carried by the summary and error fields.
  const successText = userFacingText ?? resultText;
  const outputText = boundHead(
    !failed && !hasStreams && successText !== diff ? successText : undefined,
    MAX_TEXT_CHARACTERS,
  );
  const errorText = boundTail(
    firstText(failed ? resultText : undefined, output?.error, data?.error),
    MAX_TEXT_CHARACTERS,
  );
  const truncated =
    commandData?.truncated === true ||
    parsed?.incomplete === true ||
    stdoutTail.clipped ||
    stderrTail.clipped ||
    outputText.clipped ||
    errorText.clipped;

  return {
    label: toolActionLabel(name) || "Agent tool",
    target,
    command,
    stdout,
    stderr,
    diff,
    output: outputText.text,
    error:
      errorText.text &&
      errorText.text !== activity.error &&
      errorText.text !== stdout &&
      errorText.text !== stderr
        ? errorText.text
        : undefined,
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

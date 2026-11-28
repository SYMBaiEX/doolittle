import { createHash } from "node:crypto";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { CommandResult } from "@doolittle/contracts";
import type { RunToolActivity } from "@doolittle/contracts/run";
import type { ActionResult } from "@elizaos/core";
import { isSensitiveKeyName, redactWithSecrets } from "@elizaos/core/protocol";
import { isRecord } from "../utils/records";
import { sanitizeTerminalText } from "../utils/terminal-text";
import { inspectWorkspaceCommands } from "../utils/workspace-commands";
import {
  extractCommandResultFromActionResult,
  extractFileOperationFromActionResult,
  extractLocalMutationFromActionResult,
} from "./action-result-metadata";

const MAX_COMMAND = 512;
const MAX_OUTPUT = 4 * 1024;
const MAX_PATH = 768;
const MAX_PATHS = 4;
const UNSAFE_TEXT = /[\p{Cc}\u202a-\u202e\u2066-\u2069]/u;
const SAFE_PROGRAM =
  /^(?:bun|cargo|cat|cd|curl|find|git|go|grep|ls|make|node|npm|nub|pnpm|python3?|rg|sed|sh|yarn|zsh)$/u;
const READ_COMMAND =
  /^(?:git (?:status|diff --stat|diff --check)|ls(?: -[alh]+)?|pwd)$/u;
const KNOWN_CHECK =
  /^(?:build|test|check|lint|typecheck|type-check|validate|verify)(?::(?:scope|related|all|release|check|tools))?$/u;

/** Mask configured secrets and credential shapes, keeping the tail when bounded. */
function redactText(value: string, limit: number): string | undefined {
  if (!value) return undefined;
  const secrets = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key, secret]) => isSensitiveKeyName(key) && typeof secret === "string",
    ),
  ) as Record<string, string>;
  const redacted = redactWithSecrets(value, { secrets, applyPatterns: true });
  if (!redacted) return undefined;
  if (redacted.length <= limit) return redacted;
  // Bound after masking so a credential split at the cut is already replaced.
  const tail = redacted.slice(-(limit - 1)).trimStart();
  return tail ? `…${tail}` : undefined;
}

function preview(value: unknown, limit: number): string | undefined {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > limit ||
    UNSAFE_TEXT.test(value)
  )
    return undefined;
  const candidate = value.trim();
  // Suppress a redaction match entirely, including partial token prefixes.
  return candidate && redactText(candidate, limit) === candidate
    ? candidate
    : undefined;
}

function commandPreview(
  value: unknown,
  directory?: string,
): string | undefined {
  const safe = preview(value, MAX_COMMAND);
  if (!safe) return undefined;
  if (READ_COMMAND.test(safe)) return safe;
  // Even parsed shell commands can carry arbitrary literal directories and
  // script arguments. Persist only recognized operation names.
  for (const operation of inspectWorkspaceCommands(safe, directory)) {
    if (operation.kind !== "verification" && operation.kind !== "build")
      continue;
    const script = operation.script?.split(" ", 1)[0];
    if (!script || !KNOWN_CHECK.test(script)) continue;
    const invocation = `${operation.runner} run ${script}`;
    return safe === invocation || safe === `${operation.runner} ${script}`
      ? safe
      : `${invocation} …`;
  }
  const [program, args] = safe.split(/\s+(.*)/u);
  return SAFE_PROGRAM.test(program)
    ? `${program}${args ? " …" : ""}`
    : undefined;
}

function safePath(value: unknown): string | undefined {
  return preview(value, MAX_PATH);
}

function testSummary(shell: CommandResult): string | undefined {
  if (
    shell.stdout.length > 32 * 1024 ||
    !inspectWorkspaceCommands(shell.command, shell.executedIn).some(
      ({ kind }) => kind === "verification",
    )
  )
    return undefined;
  // Node's TAP and spec reporters publish numeric totals. Tool stdout can
  // contain unrelated file contents, so keep counts and discard raw lines.
  const pass = /^[ℹ#]\s+pass\s+(\d{1,8})\s*$/mu.exec(shell.stdout)?.[1];
  const fail = /^[ℹ#]\s+fail\s+(\d{1,8})\s*$/mu.exec(shell.stdout)?.[1];
  return pass && fail ? `${pass} passed · ${fail} failed` : undefined;
}

/** Durable shell outcome: a safe test count, else the bounded redacted tail. */
function shellOutput(shell: CommandResult): string | undefined {
  const summary = testSummary(shell);
  if (summary) return summary;
  const source = shell.stderr.trim() ? shell.stderr : shell.stdout;
  const tail = redactText(source, MAX_OUTPUT);
  if (!tail) return undefined;
  const cleaned = sanitizeTerminalText(tail);
  return cleaned || undefined;
}

export function projectActionActivity(
  action: string,
  result: ActionResult | undefined,
  status?: string,
): RunToolActivity {
  const shell = extractCommandResultFromActionResult(result);
  const file = extractFileOperationFromActionResult(result);
  const mutation = extractLocalMutationFromActionResult(result);
  const failed =
    status === "failed" ||
    status === "error" ||
    result?.success === false ||
    (shell !== undefined && (!shell.success || shell.exitCode !== 0)) ||
    mutation?.success === false;
  const phase =
    status === "cancelled" || status === "canceled"
      ? "cancelled"
      : failed
        ? "failed"
        : "completed";
  if (shell) {
    const directory = safePath(shell.executedIn);
    const detail = shell.command.trim();
    return {
      action,
      phase,
      kind: "execute",
      command: commandPreview(shell.command, directory),
      // The durable preview above still hides arbitrary arguments; the full
      // invocation is masked for secrets and bounded like any other payload.
      commandDetail: UNSAFE_TEXT.test(detail)
        ? undefined
        : redactText(detail, MAX_COMMAND),
      directory,
      output: shellOutput(shell),
      exitCode: shell.exitCode,
      durationMs: shell.durationMs,
    };
  }
  const path = safePath(
    mutation?.resolvedPath ?? file?.target ?? mutation?.requestedPath,
  );
  if (path) {
    return {
      action,
      phase,
      kind: file?.type === "write" ? "edit" : file?.type,
      paths: [path],
    };
  }
  return { action, phase };
}

const WORKER_TOOL_TITLES = {
  read: "Reading file",
  search: "Searching workspace",
  edit: "Editing files",
  delete: "Removing files",
  move: "Moving files",
  execute: "Running command",
  fetch: "Fetching resource",
  other: "Using coding tool",
} as const;

function workerPath(root: string, value: unknown): string | undefined {
  const candidate = safePath(value);
  if (!candidate) return undefined;
  const path = relative(root, resolve(root, candidate));
  // ACP events can contain arbitrary targets. Only show files under the
  // already-approved workdir, and do not disclose absolute private paths.
  return path &&
    path !== ".." &&
    !path.startsWith(`..${sep}`) &&
    !isAbsolute(path)
    ? path
    : undefined;
}

const INPUT_COMMAND_ACTIONS = new Set([
  "RUN_IN_TERMINAL",
  "SHELL",
  "SHELL_COMMAND",
  "TERMINAL_SHELL",
]);

const INPUT_PATH_KEYS: Record<string, readonly string[]> = {
  CREATE_DIRECTORY: ["path", "directory", "folder", "target"],
  DOOLITTLE_WORKSPACE: ["path"],
  PATCH_FILE: ["path", "file", "target"],
  READ_FILE: ["path", "file", "target"],
  SEARCH_FILES: ["path", "directory"],
  WRITE_FILE: ["path", "file", "target"],
};

/**
 * Project the small target subset of an owner-observed tool invocation. Input
 * remains untrusted even after the SDK owner-observation redaction pass: only
 * action-specific path/command keys are read, paths must stay inside the
 * approved workdir, and commands keep the existing collapsed shell preview.
 */
export function projectNativeActionInputTarget(
  action: string,
  input: unknown,
  workdir: string,
): Pick<RunToolActivity, "command" | "paths"> {
  if (!isRecord(input)) return {};
  const name = action.toUpperCase();
  if (INPUT_COMMAND_ACTIONS.has(name)) {
    const command = commandPreview(input.command, workdir);
    return command ? { command } : {};
  }
  const keys = INPUT_PATH_KEYS[name];
  if (!keys) return {};
  const paths = [
    ...new Set(
      keys
        .map((key) => workerPath(workdir, input[key]))
        .filter((path): path is string => path !== undefined),
    ),
  ].slice(0, MAX_PATHS);
  return paths.length ? { paths } : {};
}

export function projectDelegatedToolActivity(
  sessionId: string,
  workdir: string,
  tool: Record<string, unknown>,
  previous?: RunToolActivity,
): RunToolActivity | undefined {
  if (typeof tool.id !== "string" || !tool.id || tool.id.length > 512)
    return undefined;
  const reportedKind = typeof tool.kind === "string" ? tool.kind : undefined;
  const kind = (
    reportedKind && Object.hasOwn(WORKER_TOOL_TITLES, reportedKind)
      ? reportedKind
      : (previous?.kind ?? "other")
  ) as keyof typeof WORKER_TOOL_TITLES;
  const phase =
    tool.status === "completed"
      ? "completed"
      : tool.status === "failed" || tool.status === "error"
        ? "failed"
        : tool.status === "cancelled" || tool.status === "canceled"
          ? "cancelled"
          : (tool.status === "pending" || tool.status === "queued") &&
              previous?.phase !== "running"
            ? "queued"
            : "running";
  if (
    previous &&
    (previous.phase === "completed" ||
      previous.phase === "failed" ||
      previous.phase === "cancelled") &&
    phase !== previous.phase
  )
    return undefined;
  const input = isRecord(tool.rawInput) ? tool.rawInput : {};
  const locations = Array.isArray(tool.locations)
    ? tool.locations.slice(0, MAX_PATHS)
    : [];
  const paths = [
    ...new Set(
      [
        ...(previous?.paths ?? []),
        ...locations.map((location) =>
          isRecord(location) ? workerPath(workdir, location.path) : undefined,
        ),
        workerPath(workdir, input.path),
        workerPath(workdir, input.file_path),
        workerPath(workdir, input.filePath),
      ].filter((path): path is string => path !== undefined),
    ),
  ].slice(0, MAX_PATHS);

  return {
    id:
      previous?.id ??
      `worker:${createHash("sha256")
        .update(JSON.stringify([sessionId, tool.id]))
        .digest("hex")
        .slice(0, 24)}`,
    action: "TASKS_SPAWN_AGENT",
    origin: "delegated",
    phase,
    kind,
    title: WORKER_TOOL_TITLES[kind],
    ...(paths.length && { paths }),
    ...(kind === "execute" && {
      command: commandPreview(input.command, workdir) ?? previous?.command,
    }),
  };
}

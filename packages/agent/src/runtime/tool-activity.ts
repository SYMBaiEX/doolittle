import { createHash } from "node:crypto";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { CommandResult } from "@doolittle/contracts";
import type { RunToolActivity } from "@doolittle/contracts/run";
import type { ActionResult } from "@elizaos/core";
import { isSensitiveKeyName, redactWithSecrets } from "@elizaos/core/protocol";
import { isRecord } from "../utils/records";
import { inspectWorkspaceCommands } from "../utils/workspace-commands";
import {
  extractCommandResultFromActionResult,
  extractFileOperationFromActionResult,
  extractLocalMutationFromActionResult,
} from "./action-result-metadata";

const MAX_COMMAND = 512;
const MAX_PATH = 768;
const MAX_PATHS = 4;
const SAFE_PROGRAM =
  /^(?:bun|cargo|cat|cd|curl|find|git|go|grep|ls|make|node|npm|nub|pnpm|python3?|rg|sed|sh|yarn|zsh)$/u;
const READ_COMMAND =
  /^(?:git (?:status|diff --stat|diff --check)|ls(?: -[alh]+)?|pwd)$/u;
const KNOWN_CHECK =
  /^(?:build|test|check|lint|typecheck|type-check|validate|verify)(?::(?:scope|related|all|release|check|tools))?$/u;

function preview(value: unknown, limit: number): string | undefined {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > limit ||
    /[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(value)
  )
    return undefined;
  const secrets = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key, secret]) => isSensitiveKeyName(key) && typeof secret === "string",
    ),
  ) as Record<string, string>;
  const candidate = value.trim();
  // Suppress a redaction match entirely, including partial token prefixes.
  return candidate &&
    redactWithSecrets(candidate, { secrets, applyPatterns: true }) === candidate
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
    return {
      action,
      phase,
      kind: "execute",
      command: commandPreview(shell.command, directory),
      directory,
      output: testSummary(shell),
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

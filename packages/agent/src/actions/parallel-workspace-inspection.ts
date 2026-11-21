import { realpath } from "node:fs/promises";
import { relative } from "node:path";
import { readRegularFile } from "@doolittle/storage";
import type { Action, ActionResult, Memory } from "@elizaos/core";
import { hasGlobalSessionOperatorAccess } from "../runtime/session-operator-policy";
import { getScopedTurnAbortSignal } from "../runtime/turn-runtime-scope";
import { currentConversationWorkspace } from "../runtime/workspace-scope";
import type { WorkspaceService } from "../services/workspace-service/index";
import { resolveWorkspaceServicePath } from "../services/workspace-service/path";
import { workspaceRelativePath } from "../services/workspace-service/path-format";
import { isWorkspacePathVisible } from "../services/workspace-service/policy";
import { isRecord } from "../utils/records";
import { hasAsciiControlCharacters } from "../utils/text-validation";

export const PARALLEL_WORKSPACE_INSPECTION = "INSPECT_WORKSPACE_IN_PARALLEL";

const MAX_TASKS = 6;
const CONCURRENT_INSPECTIONS = 2;
const MAX_PATH_CHARS = 256;
const MAX_QUERY_CHARS = 256;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_EVIDENCE_CHARS = 640;
const MAX_MATCH_CHARS = 320;
const READ_LINE_LIMIT = 32;
const SEARCH_RESULT_LIMIT = 5;

type Inspection =
  | { kind: "read"; path: string; fromLine: number }
  | { kind: "search"; path: string; query: string };

function operatorMessage(message: Memory): boolean {
  const metadata = message.metadata as
    | { doolittle?: { source?: unknown } }
    | undefined;
  const source = metadata?.doolittle?.source ?? message.content?.source;
  return typeof source === "string" && hasGlobalSessionOperatorAccess(source);
}

function parseInspections(value: unknown): Inspection[] | undefined {
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => key !== "tasks") ||
    !Array.isArray(value.tasks) ||
    value.tasks.length < 2 ||
    value.tasks.length > MAX_TASKS
  )
    return undefined;

  const tasks: Inspection[] = [];
  for (const input of value.tasks) {
    if (
      !isRecord(input) ||
      typeof input.path !== "string" ||
      !input.path.trim() ||
      input.path.length > MAX_PATH_CHARS ||
      hasAsciiControlCharacters(input.path)
    )
      return undefined;
    const path = input.path.trim();
    if (input.kind === "read") {
      const fromLine = input.fromLine === undefined ? 1 : input.fromLine;
      if (
        Object.keys(input).some(
          (key) => !["kind", "path", "fromLine"].includes(key),
        ) ||
        typeof fromLine !== "number" ||
        !Number.isSafeInteger(fromLine) ||
        fromLine < 1
      )
        return undefined;
      tasks.push({ kind: "read", path, fromLine });
    } else if (input.kind === "search") {
      if (
        Object.keys(input).some(
          (key) => !["kind", "path", "query"].includes(key),
        ) ||
        typeof input.query !== "string" ||
        !input.query.trim() ||
        input.query.length > MAX_QUERY_CHARS ||
        hasAsciiControlCharacters(input.query)
      )
        return undefined;
      tasks.push({ kind: "search", path, query: input.query.trim() });
    } else {
      return undefined;
    }
  }
  return tasks;
}

function boundEvidence(lines: readonly string[]): string {
  let text = "";
  for (const [index, line] of lines.entries()) {
    const remaining = MAX_EVIDENCE_CHARS - text.length;
    const separator = index === 0 ? "" : "\n";
    if (separator.length + line.length > remaining)
      return `${text}${(separator + line.slice(0, remaining)).slice(0, remaining)}\n[Evidence limited.]`;
    text += separator + line;
  }
  return text;
}

async function collectEvidence(
  search: WorkspaceService["search"],
  root: string,
  task: Inspection,
  signal: AbortSignal,
): Promise<string> {
  signal.throwIfAborted();
  const target = resolveWorkspaceServicePath(root, task.path, "read");
  const path = workspaceRelativePath(relative(root, target)) || ".";
  if (!isWorkspacePathVisible(path) || (await realpath(target)) !== target)
    throw new Error("Inspection requires a visible workspace path.");

  if (task.kind === "search") {
    const matches = await search(task.query, SEARCH_RESULT_LIMIT, {
      path,
      signal,
      maxMatchChars: MAX_MATCH_CHARS,
      singleLink: true,
    });
    return matches.length
      ? boundEvidence(
          matches.flatMap(({ path, matches }) => [
            path.length > MAX_PATH_CHARS
              ? `…${path.slice(1 - MAX_PATH_CHARS)}`
              : path,
            ...matches,
          ]),
        )
      : "No literal matches.";
  }

  const bytes = await readRegularFile(target, MAX_FILE_BYTES, {
    singleLink: true,
    signal,
  });
  if ((await realpath(target)) !== target || bytes.includes(0))
    throw new Error("Inspection requires a stable text file.");

  const lines = new TextDecoder("utf-8", { fatal: true })
    .decode(bytes)
    .split(/\r?\n/u)
    .slice(task.fromLine - 1, task.fromLine - 1 + READ_LINE_LIMIT);
  return lines.length
    ? boundEvidence(
        lines.map(
          (line, index) =>
            `${task.fromLine + index}: ${line.slice(0, MAX_EVIDENCE_CHARS + 1)}`,
        ),
      )
    : "The selected line is past the end of the file.";
}

/** SDK-selected foreground read subtasks share the caller's execution lease. */
export function createParallelWorkspaceInspectionAction(
  workspace: Pick<WorkspaceService, "root" | "search">,
): Action {
  return {
    name: PARALLEL_WORKSPACE_INSPECTION,
    description:
      "Inspect independent parts of the approved workspace concurrently before planning or verifying a coding task. Batch two to six targeted text reads and literal searches. Use explicit workspace paths for complementary subtasks, such as reading one implementation file and finding its tests in another directory. Use the evidence to synthesize a reply or plan the next action.",
    descriptionCompressed:
      "Run independent read-only workspace inspections together and collect evidence in task order.",
    routingHint:
      "independent code exploration, file comparisons, or test discovery -> INSPECT_WORKSPACE_IN_PARALLEL",
    contexts: ["code", "files"],
    cacheStable: true,
    validate: async (_runtime, message) => operatorMessage(message),
    parameters: [
      {
        name: "tasks",
        description:
          'Two to six independent inspections with workspace paths. For example [{"kind":"read","path":"src/router.ts"},{"kind":"search","path":"tests","query":"createRouter"}].',
        required: true,
        schema: {
          type: "array",
          items: {
            type: "object",
            properties: {
              kind: { type: "string", enum: ["read", "search"] },
              path: { type: "string", minLength: 1, maxLength: MAX_PATH_CHARS },
              fromLine: {
                type: "integer",
                minimum: 1,
                description: "Optional starting line for a read.",
              },
              query: {
                type: "string",
                minLength: 1,
                maxLength: MAX_QUERY_CHARS,
                description: "Required literal text for a search.",
              },
            },
            required: ["kind", "path"],
            additionalProperties: false,
          },
        },
      },
    ],
    handler: async (
      runtime,
      message,
      _state,
      options,
    ): Promise<ActionResult> => {
      if (!operatorMessage(message))
        return {
          success: false,
          text: "Parallel workspace inspection requires a local or authenticated API operator.",
        };
      const tasks = parseInspections(options?.parameters);
      if (!tasks)
        return {
          success: false,
          text: "Provide two to six workspace read or literal search tasks.",
        };

      const signal = AbortSignal.any([
        AbortSignal.timeout(20_000),
        ...[getScopedTurnAbortSignal(runtime), options?.abortSignal].filter(
          (value): value is AbortSignal => Boolean(value),
        ),
      ]);
      signal.throwIfAborted();
      const workspaceRoot = workspace.root();
      const root = await realpath(workspaceRoot);
      const binding = currentConversationWorkspace();
      if (binding && binding.workspacePath !== root)
        throw new Error("The inspection workspace changed.");
      const search: WorkspaceService["search"] = (...args) => {
        if (workspace.root() !== workspaceRoot)
          throw new Error("The inspection workspace changed.");
        return workspace.search(...args);
      };
      const results = [];
      for (
        let index = 0;
        index < tasks.length;
        index += CONCURRENT_INSPECTIONS
      ) {
        signal.throwIfAborted();
        const batch = tasks.slice(index, index + CONCURRENT_INSPECTIONS);
        const outcomes = await Promise.allSettled(
          batch.map((task) => collectEvidence(search, root, task, signal)),
        );
        signal.throwIfAborted();
        for (const [index, outcome] of outcomes.entries()) {
          const { kind, path } = batch[index];
          results.push({
            kind,
            path,
            success: outcome.status === "fulfilled",
            evidence:
              outcome.status === "fulfilled"
                ? outcome.value
                : "That path could not be inspected in the authorized workspace or exceeds the inspection limits.",
          });
        }
      }
      if (
        workspace.root() !== workspaceRoot ||
        (await realpath(workspaceRoot)) !== root
      )
        throw new Error("The inspection workspace changed.");
      signal.throwIfAborted();
      return {
        success: results.some((item) => item.success),
        text: results
          .map(
            ({ kind, path, evidence }, index) =>
              `${index + 1}. ${kind} ${path}\n${evidence}`,
          )
          .join("\n\n"),
        continueChain: true,
        data: { actionName: PARALLEL_WORKSPACE_INSPECTION, results },
      };
    },
  };
}

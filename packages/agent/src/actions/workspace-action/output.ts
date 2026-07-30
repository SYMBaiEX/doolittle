import type { IAgentRuntime } from "@elizaos/core";
import { inspectNativeProject } from "@/runtime/native/service-bridge/tooling";

export const WORKSPACE_ACTION_FALLBACK_MESSAGE =
  "I can show the project tree, summarize the selected workspace, or locate a local codebase. Use the dedicated file actions for concrete reads, searches, and edits.";

const LIST_PREVIEW_LIMIT = 12;
const GIT_CHANGE_PREVIEW_LIMIT = 8;
const README_PREVIEW_CHAR_LIMIT = 3_000;
const MERGE_CONFLICT_CODES = new Set([
  "AA",
  "AU",
  "DD",
  "DU",
  "UA",
  "UD",
  "UU",
]);

function formatLimitedList(
  values: string[],
  limit = LIST_PREVIEW_LIMIT,
): string {
  const visible = values.slice(0, limit);
  const remaining = values.length - visible.length;
  return [
    visible.join(", "),
    remaining > 0 ? `(+${remaining} more)` : undefined,
  ]
    .filter(Boolean)
    .join(" ");
}

function truncatePreview(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit).trimEnd()}\n…`;
}

export function formatGitStatusForOutput(status: string): string[] {
  const lines = status
    .split(/\r?\n/u)
    .map((line) => line.trimEnd())
    .filter(Boolean);
  const branchLine = lines[0]?.startsWith("## ")
    ? lines.shift()?.slice(3)
    : undefined;
  const changes = lines;

  if (changes.length === 0) {
    return [
      branchLine ? `- branch: ${branchLine}` : undefined,
      "- working tree: clean",
    ].filter((line): line is string => Boolean(line));
  }

  let staged = 0;
  let unstaged = 0;
  let untracked = 0;
  let conflicted = 0;
  for (const change of changes) {
    const code = change.slice(0, 2);
    if (code === "??") {
      untracked += 1;
      continue;
    }
    if (MERGE_CONFLICT_CODES.has(code)) {
      conflicted += 1;
      continue;
    }
    if (code[0] && code[0] !== " ") {
      staged += 1;
    }
    if (code[1] && code[1] !== " ") {
      unstaged += 1;
    }
  }

  const counts = [
    staged > 0 ? `${staged} staged` : undefined,
    unstaged > 0 ? `${unstaged} unstaged` : undefined,
    untracked > 0 ? `${untracked} untracked` : undefined,
    conflicted > 0 ? `${conflicted} conflicted` : undefined,
  ].filter((value): value is string => Boolean(value));
  const visibleChanges = changes.slice(0, GIT_CHANGE_PREVIEW_LIMIT);
  const remaining = changes.length - visibleChanges.length;

  return [
    branchLine ? `- branch: ${branchLine}` : undefined,
    `- working tree: ${changes.length} changed ${changes.length === 1 ? "file" : "files"}${counts.length > 0 ? ` (${counts.join(", ")})` : ""}`,
    "- sample changes:",
    ...visibleChanges.map((change) => `  ${truncatePreview(change, 240)}`),
    remaining > 0 ? `  … ${remaining} more changes` : undefined,
  ].filter((line): line is string => Boolean(line));
}

export async function summarizeProjectForOutput(
  runtime: IAgentRuntime,
  projectPath: string,
): Promise<string> {
  const inspection = await inspectNativeProject(runtime, projectPath);
  return [
    `Repo: ${inspection.name}`,
    `Path: ${inspection.path}`,
    `Type: ${inspection.type}`,
    "",
    "What matters:",
    inspection.packageName ? `- package: ${inspection.packageName}` : undefined,
    inspection.packageManager
      ? `- package manager: ${inspection.packageManager}`
      : undefined,
    inspection.workspacePatterns.length > 0
      ? `- workspaces: ${formatLimitedList(inspection.workspacePatterns)}`
      : undefined,
    inspection.scripts.length > 0
      ? `- scripts: ${formatLimitedList(inspection.scripts)}`
      : undefined,
    inspection.keyFolders.length > 0
      ? `- key folders: ${formatLimitedList(inspection.keyFolders)}`
      : undefined,
    inspection.notableFiles?.length
      ? `- verified entry files: ${formatLimitedList(inspection.notableFiles)}`
      : undefined,
    inspection.topEntries.length > 0
      ? `- top entries: ${formatLimitedList(inspection.topEntries)}`
      : undefined,
    "",
    "Git:",
    inspection.git.available
      ? inspection.git.recentCommit
        ? `- recent commit: ${truncatePreview(inspection.git.recentCommit, 240)}`
        : "- repository detected"
      : "- not detected",
    ...(inspection.git.status
      ? formatGitStatusForOutput(inspection.git.status)
      : []),
    inspection.readmePreview
      ? `\nREADME preview:\n${truncatePreview(inspection.readmePreview, README_PREVIEW_CHAR_LIMIT)}`
      : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatFoundCodebases(
  matches: Array<{
    path: string;
  }>,
): string {
  return matches.length > 0
    ? [
        "Found matching local codebases:",
        ...matches.map((match) => `- ${match.path}`),
      ].join("\n")
    : "No matching local codebase was found in the common development roots.";
}

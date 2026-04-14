import type { IAgentRuntime } from "@elizaos/core";
import { inspectEffectiveProject } from "@/runtime/native/service-bridge/tooling";
import type { AppServices } from "@/services";

export const WORKSPACE_ACTION_FALLBACK_MESSAGE =
  "I can list files, read a file, search the workspace, or write a file. Try `/workspace tree` or ask `search the repo for auth middleware`.";

export async function summarizeProjectForOutput(
  runtime: IAgentRuntime,
  services: AppServices,
  projectPath: string,
): Promise<string> {
  const inspection = await inspectEffectiveProject(
    runtime,
    services,
    projectPath,
  );
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
      ? `- workspaces: ${inspection.workspacePatterns.join(", ")}`
      : undefined,
    inspection.scripts.length > 0
      ? `- scripts: ${inspection.scripts.join(", ")}`
      : undefined,
    inspection.keyFolders.length > 0
      ? `- key folders: ${inspection.keyFolders.join(", ")}`
      : undefined,
    inspection.topEntries.length > 0
      ? `- top entries: ${inspection.topEntries.join(", ")}`
      : undefined,
    "",
    "Git:",
    inspection.git.available
      ? inspection.git.recentCommit
        ? `- recent commit: ${inspection.git.recentCommit}`
        : "- repository detected"
      : "- not detected",
    inspection.git.status ? `- status:\n${inspection.git.status}` : undefined,
    inspection.readmePreview
      ? `\nREADME preview:\n${inspection.readmePreview}`
      : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatWorkspaceSearchResults(
  results: Array<{
    path: string;
    matches: string[];
  }>,
): string {
  return results.length > 0
    ? results
        .map(
          (result) =>
            `${result.path}\n${result.matches.map((line) => `  ${line}`).join("\n")}`,
        )
        .join("\n\n")
    : "No workspace matches found.";
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

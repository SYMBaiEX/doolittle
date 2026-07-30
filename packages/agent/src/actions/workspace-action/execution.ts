import { existsSync, statSync } from "node:fs";
import type { IAgentRuntime } from "@elizaos/core";
import {
  findNativeLocalCodebases,
  getNativeWorkspaceSummary,
} from "@/runtime/native/service-bridge/tooling";
import { formatFoundCodebases, summarizeProjectForOutput } from "./output";
import {
  resolveLocalProjectPath,
  sanitizeFindQuery,
  type WorkspaceIntent,
} from "./parsing";

function resolveOverviewPath(
  intent: Extract<WorkspaceIntent, { kind: "overview" }>,
  workspaceDir: string,
): string {
  return intent.path
    ? (resolveLocalProjectPath(intent.path, workspaceDir) ?? workspaceDir)
    : workspaceDir;
}

async function executeFindCodebaseIntent(
  runtime: IAgentRuntime,
  workspaceDir: string,
  intent: Extract<WorkspaceIntent, { kind: "find-codebase" }>,
): Promise<string> {
  const query = sanitizeFindQuery(intent.query);
  if (!query) {
    return "I couldn't determine the codebase name to search for.";
  }

  const explicitProjectPath = resolveLocalProjectPath(query, workspaceDir);
  if (explicitProjectPath) {
    try {
      if (statSync(explicitProjectPath).isDirectory()) {
        return summarizeProjectForOutput(runtime, explicitProjectPath);
      }
      return `Found file path: ${explicitProjectPath}`;
    } catch (error) {
      return `I found ${explicitProjectPath}, but couldn't inspect it: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  const matches = await findNativeLocalCodebases(runtime, query);
  if (matches.length === 1 && existsSync(matches[0]?.path || "")) {
    try {
      if (statSync(matches[0].path).isDirectory()) {
        return summarizeProjectForOutput(runtime, matches[0].path);
      }
    } catch {
      // Fall back to raw result list below.
    }
  }

  const exactMatches = matches.filter((match) => match.exactBasenameMatch);
  if (exactMatches.length === 1 && existsSync(exactMatches[0]?.path || "")) {
    try {
      if (statSync(exactMatches[0].path).isDirectory()) {
        return summarizeProjectForOutput(runtime, exactMatches[0].path);
      }
    } catch {
      // Fall back to raw result list below.
    }
  }

  return formatFoundCodebases(matches);
}

export async function executeWorkspaceIntent(
  runtime: IAgentRuntime,
  workspaceDir: string,
  intent: WorkspaceIntent,
): Promise<string> {
  if (intent.kind === "tree") {
    return getNativeWorkspaceSummary(runtime, 40);
  }

  if (intent.kind === "overview") {
    return summarizeProjectForOutput(
      runtime,
      resolveOverviewPath(intent, workspaceDir),
    );
  }

  return executeFindCodebaseIntent(runtime, workspaceDir, intent);
}

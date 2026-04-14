import { existsSync, statSync } from "node:fs";
import type { IAgentRuntime } from "@elizaos/core";
import {
  findEffectiveLocalCodebases,
  readEffectiveWorkspaceFile,
  searchEffectiveWorkspace,
  writeEffectiveWorkspaceFile,
} from "@/runtime/native/service-bridge/tooling";
import type { AppServices } from "@/services";
import {
  formatFoundCodebases,
  formatWorkspaceSearchResults,
  summarizeProjectForOutput,
} from "./output";
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
  services: AppServices,
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
        return summarizeProjectForOutput(
          runtime,
          services,
          explicitProjectPath,
        );
      }
      return `Found file path: ${explicitProjectPath}`;
    } catch (error) {
      return `I found ${explicitProjectPath}, but couldn't inspect it: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  const matches = await findEffectiveLocalCodebases(runtime, services, query);
  if (matches.length === 1 && existsSync(matches[0]?.path || "")) {
    try {
      if (statSync(matches[0].path).isDirectory()) {
        return summarizeProjectForOutput(runtime, services, matches[0].path);
      }
    } catch {
      // Fall back to raw result list below.
    }
  }

  const exactMatches = matches.filter((match) => match.exactBasenameMatch);
  if (exactMatches.length === 1 && existsSync(exactMatches[0]?.path || "")) {
    try {
      if (statSync(exactMatches[0].path).isDirectory()) {
        return summarizeProjectForOutput(
          runtime,
          services,
          exactMatches[0].path,
        );
      }
    } catch {
      // Fall back to raw result list below.
    }
  }

  return formatFoundCodebases(matches);
}

export async function executeWorkspaceIntent(
  runtime: IAgentRuntime,
  services: AppServices,
  workspaceDir: string,
  intent: WorkspaceIntent,
): Promise<string> {
  if (intent.kind === "tree") {
    return services.workspace.summary(40);
  }

  if (intent.kind === "overview") {
    return summarizeProjectForOutput(
      runtime,
      services,
      resolveOverviewPath(intent, workspaceDir),
    );
  }

  if (intent.kind === "read") {
    return String(readEffectiveWorkspaceFile(runtime, services, intent.path));
  }

  if (intent.kind === "search") {
    const results = searchEffectiveWorkspace(
      runtime,
      services,
      intent.query,
      20,
    ) as Array<{
      path: string;
      matches: string[];
    }>;
    return formatWorkspaceSearchResults(results);
  }

  if (intent.kind === "write") {
    return `Wrote ${String(writeEffectiveWorkspaceFile(runtime, services, intent.path, intent.content))}.`;
  }

  return executeFindCodebaseIntent(runtime, services, workspaceDir, intent);
}

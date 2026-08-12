import type { IAgentRuntime } from "@elizaos/core";
import {
  findNativeLocalCodebases,
  getNativeWorkspaceSummary,
  resolveNativeProjectTarget,
} from "@/runtime/native/service-bridge/tooling";
import { formatFoundCodebases, summarizeProjectForOutput } from "./output";
import { sanitizeFindQuery, type WorkspaceIntent } from "./parsing";

async function executeOverviewIntent(
  runtime: IAgentRuntime,
  intent: Extract<WorkspaceIntent, { kind: "overview" }>,
): Promise<string> {
  if (!intent.path) {
    return summarizeProjectForOutput(runtime);
  }

  const target = resolveNativeProjectTarget(runtime, intent.path);
  if (!target) {
    return `Project path not found: ${intent.path}`;
  }
  if (target.kind === "file") {
    return `Found file path: ${target.path}`;
  }
  return summarizeProjectForOutput(runtime, target.path);
}

async function executeFindCodebaseIntent(
  runtime: IAgentRuntime,
  intent: Extract<WorkspaceIntent, { kind: "find-codebase" }>,
): Promise<string> {
  const query = sanitizeFindQuery(intent.query);
  if (!query) {
    return "I couldn't determine the codebase name to search for.";
  }

  const explicitTarget = resolveNativeProjectTarget(runtime, query);
  if (explicitTarget?.kind === "directory") {
    return summarizeProjectForOutput(runtime, explicitTarget.path);
  }
  if (explicitTarget?.kind === "file") {
    return `Found file path: ${explicitTarget.path}`;
  }

  const matches = await findNativeLocalCodebases(runtime, query);
  const exactMatches = matches.filter((match) => match.exactBasenameMatch);
  const inspectableMatch =
    matches.length === 1
      ? matches[0]
      : exactMatches.length === 1
        ? exactMatches[0]
        : undefined;
  if (inspectableMatch) {
    const target = resolveNativeProjectTarget(runtime, inspectableMatch.path);
    if (target?.kind === "directory") {
      return summarizeProjectForOutput(runtime, target.path);
    }
  }

  return formatFoundCodebases(matches);
}

export async function executeWorkspaceIntent(
  runtime: IAgentRuntime,
  intent: WorkspaceIntent,
): Promise<string> {
  if (intent.kind === "tree") {
    return await getNativeWorkspaceSummary(runtime, 40);
  }

  if (intent.kind === "overview") {
    return executeOverviewIntent(runtime, intent);
  }

  return executeFindCodebaseIntent(runtime, intent);
}

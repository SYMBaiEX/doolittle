import {
  executeRepositoryIntent,
  resolveRepositoryIntentFromText,
} from "@/actions/repository-action";
import {
  executeTerminalCommand,
  resolveCommandFromText,
} from "@/actions/terminal-action";
import {
  executeWorkspaceIntent,
  resolveWorkspaceIntentFromText,
} from "@/actions/workspace-action";
import type { AgentExecutionContext } from "@/runtime/chat";
import type { ChatTurnRequest } from "@/types/runtime";
import type { DirectLocalIntentExecution } from "../local-intent-fallback";

function buildWorkspaceStatusLine(
  intent: ReturnType<typeof resolveWorkspaceIntentFromText>,
): string {
  if (!intent) {
    return "Inspecting workspace structure...";
  }
  switch (intent.kind) {
    case "read":
      return `Reading ${intent.path}...`;
    case "search":
      return `Searching the workspace for "${intent.query}"...`;
    case "overview":
      return "Summarizing the local project...";
    case "find-codebase":
      return `Searching local development roots for "${intent.query}"...`;
    case "write":
      return `Writing ${intent.path}...`;
    default:
      return "Inspecting workspace structure...";
  }
}

export function resolveDirectLocalIntent(
  input: ChatTurnRequest,
  context: AgentExecutionContext,
): DirectLocalIntentExecution | undefined {
  const text = input.message.trim();

  const repositoryIntent = resolveRepositoryIntentFromText(text);
  if (repositoryIntent) {
    return {
      label: `repo:${repositoryIntent}`,
      statusLine: "Inspecting repository status...",
      isHighConfidence: true,
      kind: "retrieval",
      execute: () =>
        executeRepositoryIntent(
          context.runtime,
          context.services,
          repositoryIntent,
        ),
    };
  }

  const workspaceIntent = resolveWorkspaceIntentFromText(text);
  if (workspaceIntent) {
    return {
      label: `workspace:${workspaceIntent.kind}`,
      statusLine: buildWorkspaceStatusLine(workspaceIntent),
      isHighConfidence: workspaceIntent.kind !== "write",
      kind:
        workspaceIntent.kind === "overview" ||
        workspaceIntent.kind === "find-codebase"
          ? "synthesis"
          : "retrieval",
      execute: () =>
        executeWorkspaceIntent(
          context.runtime,
          context.services,
          context.config.workspaceDir,
          workspaceIntent,
        ),
    };
  }

  const terminalCommand = resolveCommandFromText(text);
  if (terminalCommand && !text.startsWith("/")) {
    return {
      label: `shell:${terminalCommand}`,
      statusLine: `Running \`${terminalCommand}\`...`,
      isHighConfidence: false,
      kind: "retrieval",
      execute: async () => {
        const result = await executeTerminalCommand(
          context.runtime,
          context.services,
          terminalCommand,
        );
        return result.response;
      },
    };
  }

  return undefined;
}

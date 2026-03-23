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
import type { AgentExecutionContext, AgentTurnHooks } from "@/runtime/chat";
import type { ChatTurnRequest } from "@/types";

export interface DirectLocalIntentExecution {
  label: string;
  statusLine: string;
  preferDirectExecution?: boolean;
  execute(): Promise<string>;
}

function looksLikeDeferredActionPromise(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return [
    "i'll ",
    "i will ",
    "let me ",
    "i'm going to ",
    "i am going to ",
    "one moment",
    "give me a moment",
    "searching ",
    "checking ",
    "looking ",
    "running ",
    "inspecting ",
    "reading ",
    "opening ",
  ].some((prefix) => normalized.startsWith(prefix));
}

function looksLikeNativeExecutionFailure(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return [
    "parse error",
    "didn't complete successfully",
    "did not complete successfully",
    "couldn't complete successfully",
    "could not complete successfully",
    "action didn't complete",
    "action did not complete",
    "failed to complete",
    "hit a parse error",
    "encountered a parse error",
    "tool call failed",
    "execution failed",
  ].some((fragment) => normalized.includes(fragment));
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
      preferDirectExecution: true,
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
      statusLine:
        workspaceIntent.kind === "read"
          ? `Reading ${workspaceIntent.path}...`
          : workspaceIntent.kind === "search"
            ? `Searching the workspace for "${workspaceIntent.query}"...`
            : workspaceIntent.kind === "find-codebase"
              ? `Searching local development roots for "${workspaceIntent.query}"...`
              : workspaceIntent.kind === "write"
                ? `Writing ${workspaceIntent.path}...`
                : "Inspecting workspace structure...",
      preferDirectExecution: workspaceIntent.kind !== "write",
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
      preferDirectExecution: true,
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

export function shouldPreferDirectLocalExecution(
  intent: DirectLocalIntentExecution | undefined,
): boolean {
  return Boolean(intent?.preferDirectExecution);
}

export async function executeDirectLocalIntent(
  intent: DirectLocalIntentExecution,
  sessionId: string,
  context: AgentExecutionContext,
  hooks?: AgentTurnHooks,
): Promise<string> {
  await hooks?.onResponseProgress?.({
    chunk: intent.statusLine,
    response: intent.statusLine,
    phase: "command",
  });
  context.services.runController.noteActionStarted(sessionId, intent.label);
  try {
    return await intent.execute();
  } finally {
    context.services.runController.noteActionCompleted(sessionId, intent.label);
  }
}

export function shouldUseDirectLocalFallback(input: {
  message: string;
  response: string;
  observedActionCount: number;
  runFailureMessage?: string;
}): boolean {
  return (
    input.observedActionCount === 0 &&
    (Boolean(input.runFailureMessage) ||
      !input.response.trim() ||
      looksLikeDeferredActionPromise(input.response) ||
      looksLikeNativeExecutionFailure(input.response))
  );
}

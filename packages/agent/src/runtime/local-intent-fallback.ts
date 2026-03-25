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
  isHighConfidence?: boolean;
  execute(): Promise<string>;
}

const LOCAL_EXECUTION_HINT_PATTERN =
  /\b(search|find|read|open|inspect|show|grep|rg|git|status|diff|log|repo|repository|workspace|directory|file|files|command|run|execute|terminal|shell|ls|list)\b/i;

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
      isHighConfidence: true,
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
            : workspaceIntent.kind === "overview"
              ? "Summarizing the local project..."
              : workspaceIntent.kind === "find-codebase"
                ? `Searching local development roots for "${workspaceIntent.query}"...`
                : workspaceIntent.kind === "write"
                  ? `Writing ${workspaceIntent.path}...`
                  : "Inspecting workspace structure...",
      isHighConfidence: workspaceIntent.kind !== "write",
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

export function mayNeedDirectLocalIntentInspection(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith("/") || trimmed.startsWith("!")) {
    return false;
  }
  return LOCAL_EXECUTION_HINT_PATTERN.test(trimmed);
}

export function shouldPreferDirectLocalExecution(
  intent: DirectLocalIntentExecution | undefined,
): boolean {
  return Boolean(intent?.isHighConfidence);
}

export function isHighConfidenceDirectLocalIntent(
  intent: DirectLocalIntentExecution | undefined,
): boolean {
  return shouldPreferDirectLocalExecution(intent);
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
  isHighConfidenceIntent?: boolean;
}): boolean {
  return (
    input.observedActionCount === 0 &&
    (Boolean(input.runFailureMessage) ||
      !input.response.trim() ||
      looksLikeDeferredActionPromise(input.response) ||
      looksLikeNativeExecutionFailure(input.response) ||
      Boolean(input.isHighConfidenceIntent && !input.response.trim()))
  );
}

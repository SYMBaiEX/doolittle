import { buildCommandResponse } from "@/runtime/chat-command-router";
import { runDelegationTaskInWorker as runDelegationTaskInWorkerImpl } from "@/runtime/chat-delegation-worker";
import { runSlashCommandTurn } from "@/runtime/chat-turn/command";
import { runPostCommandTurn } from "@/runtime/chat-turn/post-command";
import { prepareTurnState } from "@/runtime/chat-turn/state";
import {
  connectLinkedProvider,
  type LinkedProviderName,
  syncProviderSettings,
} from "@/runtime/linked-provider-accounts";
import { resolveWorkflowCommandPrompt } from "@/runtime/workflow-commands";
import type { ChatTurnRequest, CronJobRuntimeOverrides } from "@/types/runtime";
import type { AppContext } from "./bootstrap";

export type { LinkedProviderName };
export { connectLinkedProvider, syncProviderSettings };

export type AgentExecutionContext = Pick<
  AppContext,
  "config" | "services" | "runtime"
> & {
  gateway?: AppContext["gateway"];
};

export interface AgentTurnHooks {
  onResponseProgress?: (update: {
    chunk: string;
    response: string;
    phase: "command" | "readiness" | "model";
  }) => void | Promise<void>;
  onNotice?: (notice: {
    kind: "context" | "skills" | "status";
    message: string;
  }) => void | Promise<void>;
  runLocalShellCommand?: (params: {
    command: string;
    afterSuccessConnectProvider?: LinkedProviderName;
  }) => Promise<string>;
  abortSignal?: AbortSignal;
}

class TurnPerfTrace {
  private readonly enabled =
    process.env.DOOLITTLE_PERF_TRACE === "1" ||
    process.env.DOOLITTLE_PERF_TRACE === "true";
  private readonly startedAt = performance.now();
  private lastMark = this.startedAt;
  private readonly spans: Array<{ phase: string; ms: number }> = [];

  mark(phase: string): void {
    if (!this.enabled) {
      return;
    }
    const now = performance.now();
    this.spans.push({
      phase,
      ms: Math.round((now - this.lastMark) * 100) / 100,
    });
    this.lastMark = now;
  }

  flush(
    logger: AgentExecutionContext["runtime"]["logger"] | undefined,
    metadata: Record<string, unknown>,
  ): void {
    if (!this.enabled || !logger) {
      return;
    }
    logger.info(
      {
        ...metadata,
        totalMs: Math.round((performance.now() - this.startedAt) * 100) / 100,
        spans: this.spans,
      },
      "Agent turn performance trace",
    );
  }
}

export async function runModelAnalysisTurn(
  context: AgentExecutionContext,
  prompt: string,
  label: string,
  options?: {
    userId?: string;
    roomId?: string;
    personalityId?: string;
    runtimeOverrides?: CronJobRuntimeOverrides;
  },
): Promise<string> {
  return handleAgentTurn(
    {
      message: prompt,
      userId: options?.userId ?? `analysis:${label}`,
      roomId: options?.roomId ?? `analysis:${label}`,
      source: "analysis",
    },
    context,
    options?.personalityId
      ? {
          personalityId: options.personalityId,
          runtimeOverrides: options.runtimeOverrides,
        }
      : {
          runtimeOverrides: options?.runtimeOverrides,
        },
  );
}

export async function runDelegationTaskInWorker(
  context: AgentExecutionContext,
  taskId: string,
  options?: { assumeRunning?: boolean },
): Promise<ReturnType<AgentExecutionContext["services"]["delegation"]["get"]>> {
  return runDelegationTaskInWorkerImpl(context, taskId, options);
}

export async function executeSlashCommand(
  input: ChatTurnRequest,
  context: AgentExecutionContext,
  hooks?: AgentTurnHooks,
): Promise<string | undefined> {
  return buildCommandResponse(input, context, hooks, {
    runAnalysis: (prompt, label) =>
      runModelAnalysisTurn(context, prompt, label, {
        personalityId: context.services.personalities.getActive().id,
      }),
    runDelegationTaskInWorker: (taskId, options) =>
      runDelegationTaskInWorker(context, taskId, options),
  });
}

export async function handleAgentTurn(
  input: ChatTurnRequest,
  context: AgentExecutionContext,
  options?: {
    runtimeOverrides?: CronJobRuntimeOverrides;
    personalityId?: string;
  } & AgentTurnHooks,
): Promise<string> {
  const perf = new TurnPerfTrace();
  const preparedTurn = prepareTurnState(input, context);
  const trimmedMessage = input.message.trim();
  const workflowCommand = trimmedMessage.startsWith("/")
    ? resolveWorkflowCommandPrompt({
        message: trimmedMessage,
        workspaceDir: context.config.workspaceDir,
      })
    : undefined;
  const effectiveInput = workflowCommand
    ? {
        ...input,
        message: workflowCommand.prompt,
      }
    : input;
  const responseFromCommandLayer =
    !workflowCommand && trimmedMessage.startsWith("/")
      ? await runSlashCommandTurn(
          {
            input,
            context,
            options,
            perf,
            preparedTurn,
          },
          {
            buildCommandResponse,
            runAnalysis: (prompt, label) =>
              runModelAnalysisTurn(context, prompt, label, {
                personalityId: context.services.personalities.getActive().id,
              }),
            runDelegationTaskInWorker: (taskId, turnOptions) =>
              runDelegationTaskInWorker(context, taskId, turnOptions),
          },
        )
      : undefined;
  perf.mark("command-layer");
  if (responseFromCommandLayer) {
    return responseFromCommandLayer;
  }
  return runPostCommandTurn(
    input,
    effectiveInput,
    context,
    options ?? {},
    perf,
    undefined,
    preparedTurn,
  );
}

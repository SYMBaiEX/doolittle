import type { UUID } from "@elizaos/core";
import { buildCommandResponse } from "@/runtime/chat-command-router";
import {
  deleteNativeConversationMemories,
  rollbackNativeConversationReplay,
  snapshotNativeConversationMemories,
} from "@/runtime/chat-turn/conversation-persistence";
import { runPostCommandTurn } from "@/runtime/chat-turn/post-command";
import { prepareTurnState } from "@/runtime/chat-turn/state";
import {
  connectLinkedProvider,
  type LinkedProviderName,
  syncProviderSettings,
} from "@/runtime/linked-provider-accounts";
import { executeEffectiveDelegationTask } from "@/runtime/native/service-bridge/delegation";
import { getEffectiveActivePersonality } from "@/runtime/native/service-bridge/ownership";
import type { TurnCommandHooks } from "@/runtime/turn-runtime-scope";
import { resolveWorkflowCommandPrompt } from "@/runtime/workflow-commands";
import { resolveManagedChatAttachments } from "@/services/chat-attachments";
import type {
  AutomationRuntimeOverrides,
  ChatTurnRequest,
} from "@/types/runtime";
import type { AppContext } from "./bootstrap";
import { runModelAnalysis } from "./model-analysis";

export type { LinkedProviderName };
export { connectLinkedProvider, syncProviderSettings };

export type AgentExecutionContext = Pick<
  AppContext,
  "config" | "services" | "runtime"
> & {
  gateway?: AppContext["gateway"];
};

export interface AgentTurnHooks extends TurnCommandHooks {
  onResponseProgress?: (update: {
    chunk: string;
    response: string;
    phase: "command" | "readiness" | "model";
  }) => void | Promise<void>;
  onNotice?: (notice: {
    kind: "context" | "skills" | "status";
    message: string;
  }) => void | Promise<void>;
  abortSignal?: AbortSignal;
}

function throwIfTurnAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  const error = new Error("Agent run cancelled.");
  error.name = "AbortError";
  throw error;
}

function runInRoomQueue<T>(
  context: AgentExecutionContext,
  roomId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const queue = context.runtime.roomHandlerQueue;
  // beta.7 production runtimes expose the official room queue. Keep narrow
  // CLI/test/compatible runtime hosts operational when they intentionally
  // provide only the message-service surface.
  return queue && typeof queue.runWith === "function"
    ? queue.runWith(roomId, operation)
    : operation();
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

export async function executeSlashCommand(
  input: ChatTurnRequest,
  context: AgentExecutionContext,
  hooks?: AgentTurnHooks,
): Promise<string | undefined> {
  return buildCommandResponse(input, context, hooks, {
    runAnalysis: (prompt, label) =>
      runModelAnalysis(context, prompt, {
        label,
        personalityId: getEffectiveActivePersonality(context.runtime).id,
        abortSignal: hooks?.abortSignal,
      }),
    executeDelegationTask: async (taskId) => {
      const task = await executeEffectiveDelegationTask(
        context.runtime,
        context.services.delegationProjection,
        taskId,
      );
      if (!task) {
        throw new Error(`Delegation task not found: ${taskId}`);
      }
      return task;
    },
  });
}

export async function handleAgentTurn(
  input: ChatTurnRequest,
  context: AgentExecutionContext,
  options?: {
    runtimeOverrides?: AutomationRuntimeOverrides;
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
  if (!workflowCommand && trimmedMessage === "/retry") {
    return runInRoomQueue(
      context,
      String(preparedTurn.turn.roomId),
      async () => {
        throwIfTurnAborted(options?.abortSignal);
        const sessions = context.services.sessions;
        if (
          typeof sessions.messagesBySession !== "function" ||
          typeof sessions.replaceSessionMessages !== "function"
        ) {
          return "Retry is unavailable because complete session rollback is not supported by this runtime.";
        }
        const projectionSnapshot = sessions.messagesBySession(
          preparedTurn.turn.sessionId,
          Number.MAX_SAFE_INTEGER,
        );
        const replay = sessions.deleteLatestExchange(
          preparedTurn.turn.sessionId,
          {
            skipSlashCommands: true,
          },
        );
        if (!replay.userMessage) {
          return "No prior conversational turn is available to retry.";
        }
        const replayUserMessage = replay.userMessage;
        const restoreReplayProjection = () => {
          // A replay may already have projected a partial replacement. Reset
          // the complete cache to its exact pre-retry snapshot instead of
          // appending the discarded exchange after partial replay output.
          sessions.replaceSessionMessages(
            preparedTurn.turn.sessionId,
            projectionSnapshot,
          );
        };
        let replayAttachments: Awaited<
          ReturnType<typeof resolveManagedChatAttachments>
        > = [];
        if (replayUserMessage.attachments?.length) {
          try {
            replayAttachments = await resolveManagedChatAttachments({
              dataDir: context.config.dataDir,
              attachmentIds: replayUserMessage.attachments.map(
                (attachment) => attachment.id,
              ),
            });
          } catch {
            restoreReplayProjection();
            return "The previous turn used attachments that are no longer available, so it was not retried.";
          }
        }
        let nativeSnapshots: Awaited<
          ReturnType<typeof snapshotNativeConversationMemories>
        > = [];
        try {
          nativeSnapshots = await snapshotNativeConversationMemories(context, [
            replayUserMessage,
            ...replay.assistantMessages,
          ]);
          const nativeDelete = await deleteNativeConversationMemories(context, [
            replayUserMessage,
            ...replay.assistantMessages,
          ]);
          if (nativeDelete.unsupported.length) {
            throw new Error(
              "The selected exchange contains legacy native memory ids.",
            );
          }
        } catch {
          restoreReplayProjection();
          return "The previous exchange could not be removed from native conversation history, so it was not retried.";
        }
        const retryInput = {
          ...input,
          message: replayUserMessage.text,
          attachments: replayAttachments.map((attachment) => attachment.media),
          attachmentDescriptors: replayAttachments.map(
            (attachment) => attachment.descriptor,
          ),
        };
        const retryTurn = prepareTurnState(retryInput, context);
        perf.mark("retry-replay");
        try {
          return await runPostCommandTurn(
            retryInput,
            retryInput,
            context,
            options ?? {},
            perf,
            undefined,
            retryTurn,
          );
        } catch (replayError) {
          const rollbackErrors: unknown[] = [];
          try {
            await rollbackNativeConversationReplay({
              context,
              roomId: retryTurn.turn.roomId as UUID,
              replayMessageId: retryTurn.turn.messageId as UUID,
              originalSnapshots: nativeSnapshots,
            });
          } catch (error) {
            rollbackErrors.push(error);
          }
          try {
            restoreReplayProjection();
          } catch (error) {
            rollbackErrors.push(error);
          }
          if (rollbackErrors.length) {
            throw new Error(
              "Retry replay failed and its original exchange could not be fully restored.",
              {
                cause: new AggregateError([replayError, ...rollbackErrors]),
              },
            );
          }
          throw replayError;
        }
      },
    );
  }
  const effectiveInput = workflowCommand
    ? {
        ...input,
        message: workflowCommand.prompt,
      }
    : input;
  return runInRoomQueue(context, String(preparedTurn.turn.roomId), async () => {
    throwIfTurnAborted(options?.abortSignal);
    perf.mark("sdk-shortcut-layer");
    return runPostCommandTurn(
      input,
      effectiveInput,
      context,
      options ?? {},
      perf,
      undefined,
      preparedTurn,
    );
  });
}

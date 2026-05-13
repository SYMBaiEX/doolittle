import { randomUUID } from "node:crypto";
import { type Content, createUniqueUuid } from "@elizaos/core";
import type { AgentExecutionContext } from "@/runtime/chat";
import { stableRuntimeUuid } from "@/runtime/stable-runtime-uuid";
import type {
  ChatTurnRequest,
  RunDepth,
  ToolProgressMode,
} from "@/types/runtime";
import { recordTrajectoryEvent } from "./trajectory";

export interface TurnState {
  agentName: string;
  localInteractive: boolean;
  connectionSource: string;
  sessionId: string;
  roomId: string;
  worldId: string;
  entityId: string;
  messageServerId: string;
  settings: ReturnType<AgentExecutionContext["services"]["settings"]["get"]>;
  runId: string;
}

export interface PreparedTurnState {
  turn: TurnState;
  scheduleProfileObservation: () => void;
}

export function extractCompatTextContent(
  content: Content | null | undefined,
): string {
  if (!content) {
    return "";
  }
  if (typeof content.text === "string" && content.text.length > 0) {
    return content.text;
  }
  return "";
}

function nowIso(): string {
  return new Date().toISOString();
}

export function storeSessionMessage(
  context: AgentExecutionContext,
  input: {
    sessionId: string;
    roomId: string;
    entityId: string;
    role: "user" | "assistant" | "system";
    text: string;
  },
): void {
  context.services.sessions.storeMessage({
    id: randomUUID(),
    sessionId: input.sessionId,
    roomId: input.roomId,
    entityId: input.entityId,
    role: input.role,
    text: input.text,
    createdAt: nowIso(),
  });
}

export function scheduleBackgroundTask(task: () => void | Promise<void>): void {
  const timer = setTimeout(() => {
    void Promise.resolve()
      .then(task)
      .catch(() => undefined);
  }, 0);
  timer.unref?.();
}

export function createTurnState(
  input: ChatTurnRequest,
  context: AgentExecutionContext,
): TurnState {
  const agentName = context.runtime.character?.name ?? "Doolittle";
  const localInteractive = (input.source ?? "cli") === "cli";
  const connectionSource = localInteractive ? "cli" : (input.source ?? "cli");
  const roomKey = input.roomId ?? `room:${input.userId}`;
  const messageServerId = localInteractive
    ? stableRuntimeUuid(`${agentName}-cli-server`)
    : stableRuntimeUuid("doolittle-message-server");

  return {
    agentName,
    localInteractive,
    connectionSource,
    sessionId: roomKey,
    roomId: localInteractive
      ? stableRuntimeUuid(`${agentName}-chat-room`)
      : stableRuntimeUuid(roomKey),
    worldId: createUniqueUuid(context.runtime, messageServerId),
    entityId: stableRuntimeUuid(input.userId),
    messageServerId,
    settings: context.services.settings.get(),
    runId: randomUUID(),
  };
}

export function createProfileObservationScheduler(
  input: ChatTurnRequest,
  context: AgentExecutionContext,
  sessionId: string,
): () => void {
  return () => {
    scheduleBackgroundTask(() => {
      const profileService = context.services
        .userProfiles as typeof context.services.userProfiles & {
        get?: typeof context.services.userProfiles.get;
      };
      const before = profileService.get?.(input.userId) ?? {
        displayName: undefined,
        facts: [],
        preferences: [],
      };
      const after = context.services.userProfiles.observe(
        input.userId,
        input.message,
        input.source,
        {
          source: input.source,
          channel: input.source,
          sessionId,
          signal: input.message.slice(0, 160),
        },
      );
      const remember = (value: string) => {
        try {
          context.services.memory?.add("user", value);
        } catch {
          // Memory writes are opportunistic; profile storage remains primary.
        }
      };
      if (after.displayName && after.displayName !== before.displayName) {
        remember(`User display name: ${after.displayName}`);
      }
      for (const fact of after.facts.filter(
        (entry) => !before.facts.includes(entry),
      )) {
        remember(`User fact: ${fact}`);
      }
      for (const preference of after.preferences.filter(
        (entry) => !before.preferences.includes(entry),
      )) {
        remember(`User preference: ${preference}`);
      }
    });
  };
}

export function prepareTurnState(
  input: ChatTurnRequest,
  context: AgentExecutionContext,
): PreparedTurnState {
  const turn = createTurnState(input, context);
  return {
    turn,
    scheduleProfileObservation: createProfileObservationScheduler(
      input,
      context,
      turn.sessionId,
    ),
  };
}

export function startTrackedTurn(
  input: ChatTurnRequest,
  context: AgentExecutionContext,
  turn: TurnState,
  effectiveAgentPolicy?: {
    runDepth: RunDepth;
    maxIterations: number;
    toolProgressMode: ToolProgressMode;
  },
): void {
  const modelSettings = turn.settings?.model ?? {};
  storeSessionMessage(context, {
    sessionId: turn.sessionId,
    roomId: turn.roomId,
    entityId: turn.entityId,
    role: "user",
    text: input.message,
  });
  recordTrajectoryEvent(context, {
    category: "turn",
    event: "turn.started",
    sessionId: turn.sessionId,
    runId: turn.runId,
    roomId: String(turn.roomId),
    source: input.source ?? "cli",
    text: `[turn:started] ${input.message}`,
    provider: modelSettings.provider ?? "unknown",
    model: modelSettings.model ?? "unknown",
    metadata: {
      userId: input.userId,
      message: input.message,
      localInteractive: turn.localInteractive,
      connectionSource: turn.connectionSource,
      runDepth: effectiveAgentPolicy?.runDepth ?? turn.settings.agent.runDepth,
      configuredMaxIterations:
        effectiveAgentPolicy?.maxIterations ??
        turn.settings.agent.maxIterations,
      progressMode:
        effectiveAgentPolicy?.toolProgressMode ??
        turn.settings.agent.toolProgressMode,
      settings: {
        provider: modelSettings.provider ?? "unknown",
        model: modelSettings.model ?? "unknown",
        baseUrl: modelSettings.baseUrl ?? "",
        temperature: modelSettings.temperature ?? 0,
        maxTokens: modelSettings.maxTokens ?? 0,
      },
    },
  });
  context.services.runController.startTurn({
    sessionId: turn.sessionId,
    roomId: String(turn.roomId),
    runId: turn.runId,
    source: input.source ?? "cli",
    message: input.message,
    runDepth: effectiveAgentPolicy?.runDepth ?? turn.settings.agent.runDepth,
    configuredMaxIterations:
      effectiveAgentPolicy?.maxIterations ?? turn.settings.agent.maxIterations,
    progressMode:
      effectiveAgentPolicy?.toolProgressMode ??
      turn.settings.agent.toolProgressMode,
    pendingApprovals:
      context.services.executionApprovals.latestPendingForSession(
        turn.sessionId,
      )
        ? 1
        : 0,
  });
}

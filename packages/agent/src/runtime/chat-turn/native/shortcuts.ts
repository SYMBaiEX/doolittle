import { ModelType } from "@elizaos/core";
import type { AgentExecutionContext, AgentTurnHooks } from "@/runtime/chat";
import { renderDoolittleSoulContext } from "@/runtime/soul";
import type { TurnClassification } from "@/runtime/turn-classification/types";
import { finalizeTurnResponse, isTurnReadinessMessage } from "../finalization";
import type { TurnState } from "../state";
import { elapsedMsSince, recordTrajectoryEvent } from "../trajectory";
import { runShortcutModelWithSdkTrajectory } from "./model-trajectory";
import type { TurnPerfTrace } from "./types";

export async function finalizeNativeShortcut(input: {
  context: AgentExecutionContext;
  turn: TurnState;
  response: string;
  scheduleProfileObservation: () => void;
  options?: AgentTurnHooks;
  channel: "model" | "readiness";
  perf: TurnPerfTrace;
  path: string;
  source: string | undefined;
  markPhase?: string;
}): Promise<string> {
  const modelSettings = input.turn.settings?.model ?? {};
  recordTrajectoryEvent(input.context, {
    category: "turn",
    event: "turn.shortcut",
    sessionId: input.turn.sessionId,
    runId: input.turn.runId,
    roomId: String(input.turn.roomId),
    source: input.source ?? "cli",
    provider: modelSettings.provider ?? "unknown",
    model: modelSettings.model ?? "unknown",
    text: `[turn:shortcut] ${input.path}`,
    metadata: {
      path: input.path,
      channel: input.channel,
      response: input.response,
      responseChars: input.response.length,
    },
  });
  await finalizeTurnResponse(
    input.context,
    input.turn,
    input.response,
    input.scheduleProfileObservation,
    input.options,
    input.channel,
  );
  if (input.markPhase) {
    input.perf.mark(input.markPhase);
  }
  input.perf.flush(input.context.runtime.logger, {
    path: input.path,
    sessionId: input.turn.sessionId,
    source: input.source ?? "cli",
  });
  return input.response;
}

function isMemoryConversationPrompt(message: string): boolean {
  return (
    /\b(?:long[-\s]?term|memory|memeory|memry)\b/i.test(message) ||
    /\b(?:what|why|how|where|can|could|do|does)\b.*\b(?:remember|recall)\b/i.test(
      message,
    )
  );
}

function shouldUseDirectInformationalModelPath(
  classification: TurnClassification,
  message: string,
): boolean {
  return (
    classification.informationalOnly &&
    !classification.actionOriented &&
    !classification.likelyLocalTask &&
    (!classification.requiresFullContext || isMemoryConversationPrompt(message))
  );
}

function asTextList(value: unknown, limit = 5): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .slice(0, limit);
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return [];
}

function buildCharacterVoiceContext(context: AgentExecutionContext): string[] {
  const character = context.runtime.character as
    | {
        name?: string;
        bio?: unknown;
        lore?: unknown;
        adjectives?: unknown;
        style?: {
          all?: unknown;
          chat?: unknown;
          post?: unknown;
        };
      }
    | undefined;
  const personality = (
    context.services as {
      personalities?: {
        getActive?: () => {
          name?: string;
          description?: string;
          systemAddendum?: string;
        };
      };
    }
  ).personalities?.getActive?.();
  const bio = asTextList(character?.bio, 4);
  const lore = asTextList(character?.lore, 3);
  const style = [
    ...asTextList(character?.style?.all, 4),
    ...asTextList(character?.style?.chat, 4),
  ].slice(0, 6);
  const adjectives = asTextList(character?.adjectives, 8);

  return [
    "Doolittle voice:",
    `- name=${character?.name ?? "Doolittle"}`,
    ...bio.map((entry) => `- bio=${entry}`),
    ...lore.map((entry) => `- lore=${entry}`),
    ...(adjectives.length ? [`- adjectives=${adjectives.join(", ")}`] : []),
    ...style.map((entry) => `- style=${entry}`),
    personality
      ? `- activePersonality=${personality.name ?? "default"}: ${
          personality.description ?? ""
        } ${personality.systemAddendum ?? ""}`.trim()
      : undefined,
  ].filter((line): line is string => Boolean(line));
}

function buildRecentConversationContext(input: {
  context: AgentExecutionContext;
  sessionId: string;
}): string[] {
  try {
    const recentBySession = (
      input.context.services.sessions as {
        recentBySession?: (
          sessionId: string,
          limit: number,
        ) => Array<{ role: string; text: string; createdAt?: string }>;
      }
    ).recentBySession;
    const recent = recentBySession?.(input.sessionId, 6) ?? [];
    const ordered = [...recent].reverse();
    if (!ordered.length) {
      return [];
    }
    return [
      "Recent conversation:",
      ...ordered.map(
        (message) => `- ${message.role}: ${message.text.slice(0, 220)}`,
      ),
    ];
  } catch {
    return [];
  }
}

function buildDurableMemoryContext(input: {
  context: AgentExecutionContext;
  userId: string;
  message: string;
}): string[] {
  try {
    const profile = input.context.services.userProfiles.get(input.userId);
    const memory = input.context.services.memory.summary("memory");
    const userMemory = input.context.services.memory.summary("user");
    const recall = input.context.services.userProfiles.recall(
      input.userId,
      input.message,
      5,
    );
    const lines = [
      "Durable memory context:",
      profile.displayName
        ? `- savedDisplayName=${profile.displayName}`
        : "- savedDisplayName=none",
      profile.aliases?.length
        ? `- aliases=${profile.aliases.slice(-3).join(", ")}`
        : null,
      profile.facts.length
        ? `- facts=${profile.facts.slice(-3).join("; ")}`
        : null,
      profile.preferences.length
        ? `- preferences=${profile.preferences.slice(-3).join("; ")}`
        : null,
      profile.explicitMemories?.length
        ? `- explicitMemories=${profile.explicitMemories.slice(-3).join("; ")}`
        : null,
      memory.preview.length
        ? `- sharedMemory=${memory.preview.slice(-3).join("; ")}`
        : `- sharedMemoryEntries=${memory.entries}`,
      userMemory.preview.length
        ? `- userMemory=${userMemory.preview.slice(-3).join("; ")}`
        : `- userMemoryEntries=${userMemory.entries}`,
      recall.length
        ? `- recall=${recall
            .map((hit) => `${hit.kind}: ${hit.value}`)
            .slice(0, 5)
            .join("; ")}`
        : null,
      "- For name questions, answer only from savedDisplayName or aliases. Do not infer a name from local account, path, or workspace labels.",
      "- For memory questions, describe the memory context above plainly and say when a specific value is not saved.",
    ];
    return lines.filter((line): line is string => Boolean(line));
  } catch {
    return [];
  }
}

function isPresenceOrSmallTalkPrompt(message: string): boolean {
  return /\b(how are you|how'?s your|how is your|how are things|night|morning|evening|day|feel|feeling|doing|experience|curious how you are)\b/i.test(
    message,
  );
}

export function buildDirectInformationalPrompt(input: {
  context: AgentExecutionContext;
  turn: TurnState;
  userId: string;
  message: string;
}): string {
  const settings = input.context.services.settings.get();
  const socialMode = isPresenceOrSmallTalkPrompt(input.message);
  return [
    `You are ${input.turn.agentName}.`,
    "",
    ...buildCharacterVoiceContext(input.context),
    "",
    ...renderDoolittleSoulContext(input.context.config.workspaceDir),
    "",
    "Conversation contract:",
    "- Sound like a present conversational partner, not a product brochure.",
    "- Keep it truthful: you are terminal-native software, not a biological person, but you can still answer from your situated terminal experience.",
    "- Do not lead with 'I do not experience', 'as an AI', or capability disclaimers unless the user explicitly asks what you are.",
    "- For social questions, answer with warmth, curiosity, and a little texture. It is fine to say things like 'in my terminal way' or 'from over here in the logs'.",
    "- For technical questions, be concrete and accurate; mention architecture only when it helps answer the question.",
    "- Answer in one to four concise sentences.",
    socialMode
      ? "- This turn is social/presence-oriented. Do not redirect immediately to work; meet the user first."
      : "- This turn is informational. Be natural first, then useful.",
    "",
    ...buildRecentConversationContext({
      context: input.context,
      sessionId: input.turn.sessionId,
    }),
    "",
    ...buildDurableMemoryContext({
      context: input.context,
      userId: input.userId,
      message: input.message,
    }),
    "",
    "Runtime facts for technical/capability questions only:",
    "- Doolittle is an ElizaOS-native TypeScript agent.",
    "- It can run as a local CLI conversation shell with optional HTTP API, scheduler, gateway, plugins, memory, and tool services.",
    "- Exact repository details require a repo inspection turn; do not pretend you inspected files in this fast path.",
    `- workspace=${input.context.config.workspaceDir}`,
    `- provider=${settings.model.provider}`,
    `- model=${settings.model.model}`,
    "",
    `User: ${input.message.trim()}`,
    `${input.turn.agentName}:`,
  ].join("\n");
}

export function normalizeDirectInformationalResponse(
  response: unknown,
): string {
  if (typeof response !== "string") {
    return "";
  }
  return response
    .replace(/^\s*(?:Doolittle|Assistant|Agent)\s*:\s*/i, "")
    .trim();
}

export async function handleDirectInformationalModelTurn(input: {
  context: AgentExecutionContext;
  turn: TurnState;
  userId: string;
  message: string;
  classification: TurnClassification;
  scheduleProfileObservation: () => void;
  options?: AgentTurnHooks;
  perf: TurnPerfTrace;
  source: string | undefined;
}): Promise<string | undefined> {
  if (
    !input.turn.localInteractive ||
    !shouldUseDirectInformationalModelPath(input.classification, input.message)
  ) {
    return undefined;
  }

  const prompt = buildDirectInformationalPrompt(input);
  const startedAt = performance.now();
  const settings = input.context.services.settings.get();
  recordTrajectoryEvent(input.context, {
    category: "model",
    event: "model.request",
    sessionId: input.turn.sessionId,
    runId: input.turn.runId,
    roomId: String(input.turn.roomId),
    source: input.source ?? "cli",
    provider: settings.model.provider,
    model: settings.model.model,
    text: `[model:request] direct-informational-model ${settings.model.provider}/${settings.model.model}`,
    metadata: {
      path: "direct-informational-model",
      modelType: ModelType.TEXT_SMALL,
      prompt,
      promptChars: prompt.length,
      temperature: 0.35,
      maxTokens: input.classification.simpleChat ? 96 : 192,
    },
  });
  try {
    const modelRun = await runShortcutModelWithSdkTrajectory({
      context: input.context,
      turn: input.turn,
      source: input.source,
      path: "direct-informational-model",
      purpose: "response",
      metadata: {
        modelType: ModelType.TEXT_SMALL,
        promptChars: prompt.length,
      },
      run: () =>
        input.context.runtime.useModel(ModelType.TEXT_SMALL, {
          prompt,
          temperature: 0.35,
          maxTokens: input.classification.simpleChat ? 96 : 192,
          stopSequences: ["\nUser:", "\nAssistant:", "\nDoolittle:"],
        }),
    });
    const response = normalizeDirectInformationalResponse(modelRun.result);
    recordTrajectoryEvent(input.context, {
      category: "model",
      event: "model.response",
      sessionId: input.turn.sessionId,
      runId: input.turn.runId,
      roomId: String(input.turn.roomId),
      source: input.source ?? "cli",
      provider: settings.model.provider,
      model: settings.model.model,
      elapsedMs: elapsedMsSince(startedAt),
      text: `[model:response] ${response}`,
      metadata: {
        path: "direct-informational-model",
        trajectoryStepId: modelRun.trajectoryStepId,
        response,
        responseChars: response.length,
      },
    });

    if (!response) {
      return undefined;
    }

    return finalizeNativeShortcut({
      context: input.context,
      turn: input.turn,
      response,
      scheduleProfileObservation: input.scheduleProfileObservation,
      options: input.options,
      channel: "model",
      perf: input.perf,
      path: "direct-informational-model",
      source: input.source,
      markPhase: "direct-informational-model",
    });
  } catch (error) {
    recordTrajectoryEvent(input.context, {
      category: "model",
      event: "model.error",
      sessionId: input.turn.sessionId,
      runId: input.turn.runId,
      roomId: String(input.turn.roomId),
      source: input.source ?? "cli",
      provider: settings.model.provider,
      model: settings.model.model,
      elapsedMs: elapsedMsSince(startedAt),
      text: "[model:error] direct-informational-model",
      metadata: {
        path: "direct-informational-model",
        error,
      },
    });
    input.context.runtime.logger?.warn(
      {
        error,
        roomId: input.turn.roomId,
        sessionId: input.turn.sessionId,
      },
      "Direct informational fast path failed; falling back to provider runtime",
    );
    return undefined;
  }
}

export async function handleReadyResponseTurn(input: {
  context: AgentExecutionContext;
  turn: TurnState;
  readinessMessage: string | undefined;
  scheduleProfileObservation: () => void;
  options?: AgentTurnHooks;
  perf: TurnPerfTrace;
  source: string | undefined;
}): Promise<string | undefined> {
  if (!isTurnReadinessMessage(input.readinessMessage)) {
    return undefined;
  }
  return finalizeNativeShortcut({
    context: input.context,
    turn: input.turn,
    response: input.readinessMessage,
    scheduleProfileObservation: input.scheduleProfileObservation,
    options: input.options,
    channel: "readiness",
    perf: input.perf,
    path: "provider-readiness",
    source: input.source,
  });
}

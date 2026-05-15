import { type Memory, MemoryType, ModelType, type UUID } from "@elizaos/core";
import type { AgentExecutionContext, AgentTurnHooks } from "@/runtime/chat";
import {
  buildNativeUserPersonalityPreferences,
  NATIVE_USER_PERSONALITY_MAX_PREFERENCES,
  NATIVE_USER_PERSONALITY_PREFERENCES_TABLE,
} from "@/services/user-profile/native-personality";
import type { UserProfileRecord } from "@/types";
import type { TurnState } from "../state";
import { elapsedMsSince, recordTrajectoryEvent } from "../trajectory";
import { runShortcutModelWithSdkTrajectory } from "./model-trajectory";
import {
  buildDirectInformationalPrompt,
  finalizeNativeShortcut,
  normalizeDirectInformationalResponse,
} from "./shortcuts";
import type { TurnPerfTrace } from "./types";

const NAME_UPDATE_PATTERN =
  /\b(?:update|set|save)\s+my\s+name\s+(?:to|as)\s+([^,.!?;\n]+)(?:[,.!?;]|$)/iu;

export function extractDisplayNameUpdate(message: string): string | undefined {
  const direct = message.match(NAME_UPDATE_PATTERN)?.[1]?.trim();
  if (direct) {
    return direct;
  }
  return message
    .match(/\bmy\s+name\s+is\s+([^,.!?;\n]+)(?:[,.!?;]|$)/iu)?.[1]
    ?.trim();
}

function asksForDoolittleIdentity(message: string): boolean {
  return /\b(?:yourself|your personality|personality|soul|interests?|likes?|who are you|what is your name|tell me about yourself)\b/iu.test(
    message,
  );
}

function asksForSoulIdentityWork(message: string): boolean {
  return (
    /\bsoul\.md\b/iu.test(message) ||
    /\b(?:form|build|create|write|give yourself|develop)\b[\s\S]{0,80}\bsoul\b/iu.test(
      message,
    ) ||
    /\b(?:true|real|actual)\s+(?:personality|soul|identity)\b/iu.test(message)
  );
}

type NativePreferenceMemory = Pick<Memory, "id" | "content" | "metadata">;

function nativePreferenceText(memory: NativePreferenceMemory): string {
  return typeof memory.content?.text === "string"
    ? memory.content.text.trim()
    : "";
}

function isGeneratedDisplayNamePreference(memory: NativePreferenceMemory) {
  const metadata = memory.metadata as
    | { category?: unknown; source?: unknown }
    | undefined;
  return (
    metadata?.category === "identity/display-name" ||
    nativePreferenceText(memory).startsWith("Address the user as ")
  );
}

export async function rememberNativeUserPersonalityPreferences(input: {
  context: AgentExecutionContext;
  entityId: string;
  profile: UserProfileRecord;
  sessionId: string;
  message: string;
}): Promise<number> {
  const runtime = input.context.runtime as typeof input.context.runtime & {
    getMemories?: (params: {
      entityId: UUID;
      roomId: UUID;
      tableName: string;
      count: number;
    }) => Promise<NativePreferenceMemory[]>;
    createMemory?: (
      memory: Memory,
      tableName: string,
      unique?: boolean,
    ) => Promise<UUID>;
    deleteMemory?: (memoryId: UUID) => Promise<void>;
  };
  if (
    !runtime.agentId ||
    typeof runtime.getMemories !== "function" ||
    typeof runtime.createMemory !== "function"
  ) {
    return 0;
  }

  try {
    const desiredPreferences = buildNativeUserPersonalityPreferences(
      input.profile,
      NATIVE_USER_PERSONALITY_MAX_PREFERENCES,
    );
    if (!desiredPreferences.length) {
      return 0;
    }

    const desiredDisplayName = input.profile.displayName
      ? `Address the user as ${input.profile.displayName} when natural.`
      : undefined;
    const existing = await runtime.getMemories({
      entityId: input.entityId as UUID,
      roomId: runtime.agentId as UUID,
      tableName: NATIVE_USER_PERSONALITY_PREFERENCES_TABLE,
      count: NATIVE_USER_PERSONALITY_MAX_PREFERENCES + 8,
    });
    const staleDisplayNameMemories = desiredDisplayName
      ? existing.filter(
          (memory) =>
            isGeneratedDisplayNamePreference(memory) &&
            nativePreferenceText(memory) !== desiredDisplayName,
        )
      : [];

    if (typeof runtime.deleteMemory === "function") {
      for (const memory of staleDisplayNameMemories) {
        if (memory.id) {
          await runtime.deleteMemory(memory.id as UUID);
        }
      }
    }

    const staleIds = new Set(
      staleDisplayNameMemories
        .map((memory) => memory.id)
        .filter((id): id is string => typeof id === "string"),
    );
    const existingTexts = new Set(
      existing
        .filter((memory) => !staleIds.has(String(memory.id ?? "")))
        .map((memory) => nativePreferenceText(memory).toLowerCase())
        .filter(Boolean),
    );
    const availableSlots = Math.max(
      0,
      NATIVE_USER_PERSONALITY_MAX_PREFERENCES - existingTexts.size,
    );
    let written = 0;

    for (const preference of desiredPreferences) {
      if (written >= availableSlots) {
        break;
      }
      if (existingTexts.has(preference.toLowerCase())) {
        continue;
      }
      await runtime.createMemory(
        {
          entityId: input.entityId as UUID,
          roomId: runtime.agentId as UUID,
          content: {
            text: preference,
            source: "doolittle_user_profile",
          },
          metadata: {
            type: MemoryType.CUSTOM,
            category:
              preference === desiredDisplayName
                ? "identity/display-name"
                : "interaction",
            timestamp: Date.now(),
            source: "doolittle-profile-memory",
            sessionId: input.sessionId,
            originalRequest: input.message.slice(0, 200),
          },
        } as Memory,
        NATIVE_USER_PERSONALITY_PREFERENCES_TABLE,
        true,
      );
      existingTexts.add(preference.toLowerCase());
      written++;
    }

    return written;
  } catch (error) {
    input.context.runtime.logger?.warn(
      { error, sessionId: input.sessionId },
      "Failed to mirror user profile into native personality preferences",
    );
    return 0;
  }
}

async function rememberDisplayName(input: {
  context: AgentExecutionContext;
  userId: string;
  entityId: string;
  displayName: string;
  source: string | undefined;
  sessionId: string;
  message: string;
}): Promise<void> {
  const profile = input.context.services.userProfiles.observe(
    input.userId,
    `My name is ${input.displayName}.`,
    input.source,
    {
      source: input.source,
      channel: input.source,
      sessionId: input.sessionId,
      signal: input.message.slice(0, 160),
    },
  );
  await rememberNativeUserPersonalityPreferences({
    context: input.context,
    entityId: input.entityId,
    profile,
    sessionId: input.sessionId,
    message: input.message,
  });
  try {
    input.context.services.memory.add(
      "user",
      `User display name: ${input.displayName}`,
    );
  } catch {
    // Profile storage is primary; memory mirroring is best-effort.
  }
}

export async function handleProfileMemoryModelTurn(input: {
  context: AgentExecutionContext;
  turn: TurnState;
  userId: string;
  message: string;
  scheduleProfileObservation: () => void;
  options?: AgentTurnHooks;
  perf: TurnPerfTrace;
  source: string | undefined;
}): Promise<string | undefined> {
  const displayName = extractDisplayNameUpdate(input.message);
  if (!input.turn.localInteractive || !displayName) {
    return undefined;
  }

  await rememberDisplayName({
    context: input.context,
    userId: input.userId,
    entityId: input.turn.entityId,
    displayName,
    source: input.source,
    sessionId: input.turn.sessionId,
    message: input.message,
  });

  const identityRequest = asksForDoolittleIdentity(input.message);
  const prompt = [
    buildDirectInformationalPrompt(input),
    "",
    "This turn has already applied a durable user profile update.",
    `- savedDisplayName=${displayName}`,
    identityRequest
      ? "- The user also asked about Doolittle's personality or soul. Answer from SOUL.md with warmth and specificity."
      : "- Acknowledge the saved name naturally.",
  ].join("\n");
  const settings = input.context.services.settings.get();
  const startedAt = performance.now();

  recordTrajectoryEvent(input.context, {
    category: "model",
    event: "model.request",
    sessionId: input.turn.sessionId,
    runId: input.turn.runId,
    roomId: String(input.turn.roomId),
    source: input.source ?? "cli",
    provider: settings.model.provider,
    model: settings.model.model,
    text: `[model:request] profile-memory-model ${settings.model.provider}/${settings.model.model}`,
    metadata: {
      path: "profile-memory-model",
      modelType: ModelType.TEXT_SMALL,
      prompt,
      promptChars: prompt.length,
      displayName,
      identityRequest,
      temperature: 0.45,
      maxTokens: identityRequest ? 260 : 120,
    },
  });

  try {
    const modelRun = await runShortcutModelWithSdkTrajectory({
      context: input.context,
      turn: input.turn,
      source: input.source,
      path: "profile-memory-model",
      purpose: "response",
      metadata: {
        modelType: ModelType.TEXT_SMALL,
        promptChars: prompt.length,
        displayName,
        identityRequest,
      },
      run: () =>
        input.context.runtime.useModel(ModelType.TEXT_SMALL, {
          prompt,
          temperature: 0.45,
          maxTokens: identityRequest ? 260 : 120,
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
        path: "profile-memory-model",
        trajectoryStepId: modelRun.trajectoryStepId,
        response,
        responseChars: response.length,
        displayName,
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
      path: "profile-memory-model",
      source: input.source,
      markPhase: "profile-memory-model",
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
      text: "[model:error] profile-memory-model",
      metadata: {
        path: "profile-memory-model",
        error,
        displayName,
      },
    });
    input.context.runtime.logger?.warn(
      {
        error,
        roomId: input.turn.roomId,
        sessionId: input.turn.sessionId,
      },
      "Profile memory fast path failed; falling back to provider runtime",
    );
    return undefined;
  }
}

export async function handleSoulIdentityModelTurn(input: {
  context: AgentExecutionContext;
  turn: TurnState;
  userId: string;
  message: string;
  scheduleProfileObservation: () => void;
  options?: AgentTurnHooks;
  perf: TurnPerfTrace;
  source: string | undefined;
}): Promise<string | undefined> {
  if (!input.turn.localInteractive || !asksForSoulIdentityWork(input.message)) {
    return undefined;
  }

  const prompt = [
    buildDirectInformationalPrompt(input),
    "",
    "Soul identity task:",
    "- Treat this as a Doolittle identity/personality conversation, not a global character mutation.",
    "- Answer from the local SOUL.md when it exists.",
    "- Be warm, vivid, and specific. Avoid sterile disclaimers.",
    "- If the user asked for a soul file, acknowledge that SOUL.md is the local editable identity file.",
  ].join("\n");
  const settings = input.context.services.settings.get();
  const startedAt = performance.now();

  recordTrajectoryEvent(input.context, {
    category: "model",
    event: "model.request",
    sessionId: input.turn.sessionId,
    runId: input.turn.runId,
    roomId: String(input.turn.roomId),
    source: input.source ?? "cli",
    provider: settings.model.provider,
    model: settings.model.model,
    text: `[model:request] soul-identity-model ${settings.model.provider}/${settings.model.model}`,
    metadata: {
      path: "soul-identity-model",
      modelType: ModelType.TEXT_SMALL,
      prompt,
      promptChars: prompt.length,
      temperature: 0.55,
      maxTokens: 280,
    },
  });

  try {
    const modelRun = await runShortcutModelWithSdkTrajectory({
      context: input.context,
      turn: input.turn,
      source: input.source,
      path: "soul-identity-model",
      purpose: "response",
      metadata: {
        modelType: ModelType.TEXT_SMALL,
        promptChars: prompt.length,
      },
      run: () =>
        input.context.runtime.useModel(ModelType.TEXT_SMALL, {
          prompt,
          temperature: 0.55,
          maxTokens: 280,
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
        path: "soul-identity-model",
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
      path: "soul-identity-model",
      source: input.source,
      markPhase: "soul-identity-model",
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
      text: "[model:error] soul-identity-model",
      metadata: {
        path: "soul-identity-model",
        error,
      },
    });
    input.context.runtime.logger?.warn(
      {
        error,
        roomId: input.turn.roomId,
        sessionId: input.turn.sessionId,
      },
      "Soul identity fast path failed; falling back to provider runtime",
    );
    return undefined;
  }
}

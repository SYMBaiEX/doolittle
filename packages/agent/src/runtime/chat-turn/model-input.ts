import type { AgentExecutionContext } from "@/runtime/chat";
import { resolveTurnCapabilityProfile } from "@/runtime/turn-classification/message";
import type {
  TurnCapabilityProfile,
  TurnClassification,
  TurnExecutionPolicy,
} from "@/runtime/turn-classification/types";
import type { ChatTurnRequest } from "@/types/runtime";
import {
  buildInformationalResponseCacheKey,
  shouldUseInformationalResponseCache,
} from "./cache";
import { buildCapabilityPrelude, buildCodingContextPrelude } from "./prelude";
import {
  buildSystemFactsContext,
  shouldAttachSystemFacts,
} from "./response-shaping";
import type { TurnState } from "./state";

export interface PreferredLocalIntentModelInput {
  directLocalIntent: unknown;
  requiresModelSynthesisForLocalIntent: (intent: never) => boolean;
}

export interface ModelInputAssembly {
  responseCacheKey?: string;
  capabilityProfile: TurnCapabilityProfile;
  requiresPreferredLocalIntentSynthesis: boolean;
  build(localSynthesisPrelude?: string): {
    messagePrelude: string;
    effectiveMessage: string;
  };
}

export function requiresPreferredLocalIntentSynthesis(
  preferredLocalIntent?: PreferredLocalIntentModelInput | null,
): boolean {
  return Boolean(
    preferredLocalIntent?.directLocalIntent &&
      preferredLocalIntent.requiresModelSynthesisForLocalIntent(
        preferredLocalIntent.directLocalIntent as never,
      ),
  );
}

export function createModelInputAssembly(input: {
  context: AgentExecutionContext;
  turn: TurnState;
  effectiveInput: ChatTurnRequest;
  derivedTurnPolicy: TurnExecutionPolicy;
  turnClassification: TurnClassification;
  settingsDuring: ReturnType<
    AgentExecutionContext["services"]["settings"]["get"]
  >;
  options?: { personalityId?: string };
  preferredLocalIntent?: PreferredLocalIntentModelInput | null;
}): ModelInputAssembly {
  const personalityBefore = input.context.services.personalities.getActive();
  const shouldUseResponseCache = shouldUseInformationalResponseCache({
    localInteractive: input.turn.localInteractive,
    classification: input.turnClassification,
    policy: input.derivedTurnPolicy,
  });
  const responseCacheKey = shouldUseResponseCache
    ? buildInformationalResponseCacheKey({
        sessionId: input.turn.sessionId,
        provider: input.settingsDuring.model.provider,
        model: input.settingsDuring.model.model,
        personalityId: input.options?.personalityId ?? personalityBefore.id,
        message: input.effectiveInput.message,
      })
    : undefined;

  const systemFactsPrelude = shouldAttachSystemFacts(
    input.effectiveInput.message,
  )
    ? buildSystemFactsContext(input.context)
    : undefined;
  const capabilityProfile = resolveTurnCapabilityProfile(
    input.effectiveInput.message,
    {
      localInteractive: input.turn.localInteractive,
    },
  );
  const capabilityPrelude = buildCapabilityPrelude({
    context: input.context,
    profile: capabilityProfile,
  });
  const codingPrelude =
    input.turn.localInteractive &&
    input.turnClassification.likelyLocalTask &&
    input.turnClassification.actionOriented
      ? buildCodingContextPrelude({
          context: input.context,
          sessionId: input.turn.sessionId,
          taskDescription: input.effectiveInput.message,
          workspaceRoot: input.context.config.workspaceDir,
          maxIterations: input.derivedTurnPolicy.maxIterations,
        })
      : undefined;

  const preferredLocalIntentNeedsSynthesis =
    requiresPreferredLocalIntentSynthesis(input.preferredLocalIntent);

  return {
    responseCacheKey,
    capabilityProfile,
    requiresPreferredLocalIntentSynthesis: preferredLocalIntentNeedsSynthesis,
    build(localSynthesisPrelude) {
      const messagePrelude = [
        systemFactsPrelude,
        capabilityPrelude,
        codingPrelude,
        localSynthesisPrelude,
      ]
        .filter((value): value is string => Boolean(value?.trim()))
        .join("\n\n");

      return {
        messagePrelude,
        effectiveMessage: messagePrelude
          ? `${messagePrelude}\n\nUser request:\n${input.effectiveInput.message}`
          : input.effectiveInput.message,
      };
    },
  };
}

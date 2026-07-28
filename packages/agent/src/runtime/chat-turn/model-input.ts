import type { AgentExecutionContext } from "@/runtime/chat";
import { resolveTurnCapabilityProfile } from "@/runtime/turn-classification/message";
import type {
  TurnCapabilityProfile,
  TurnClassification,
  TurnExecutionPolicy,
} from "@/runtime/turn-classification/types";
import type { ChatTurnRequest } from "@/types/runtime";
import { buildProjectPromptContext } from "../prompt-cache";
import { buildDoolittleExperiencePrelude } from "./experience-prelude";
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
  const experiencePrelude = buildDoolittleExperiencePrelude({
    context: input.context,
    turn: input.turn,
    userId: input.effectiveInput.userId,
    message: input.effectiveInput.message,
  });
  const projectPrelude = buildProjectPromptContext({
    sessions: input.context.services.sessions,
    sessionId: input.turn.sessionId,
    workspaceDir: input.context.config.workspaceDir,
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
    capabilityProfile,
    requiresPreferredLocalIntentSynthesis: preferredLocalIntentNeedsSynthesis,
    build(localSynthesisPrelude) {
      const messagePrelude = [
        experiencePrelude,
        projectPrelude,
        systemFactsPrelude,
        capabilityPrelude,
        codingPrelude,
        localSynthesisPrelude,
      ]
        .filter((value): value is string => Boolean(value?.trim()))
        .join("\n\n");

      return {
        messagePrelude,
        effectiveMessage: input.effectiveInput.message,
      };
    },
  };
}

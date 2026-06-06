import {
  addIteration,
  type CodingAgentContext,
  createCodingAgentContext,
  injectFeedback,
  validateCodingAgentContext,
} from "@elizaos/autonomous/services/coding-agent-context";
import type { AppServices } from "@/services";
import type { RuntimeLike } from "../runtime-contracts";
import { getNativeCodingAgent } from "./native-services";
import type { EffectiveCodingAgentContextInput } from "./types";

function createFallbackCodingAgentContext(
  services: AppServices,
  input: EffectiveCodingAgentContextInput,
) {
  const baseContext = createCodingAgentContext({
    sessionId: input.sessionId,
    taskDescription: input.taskDescription,
    workingDirectory: input.workspaceRoot,
    connectorBasePath: input.workspaceRoot,
    connectorType:
      input.connectorType ??
      (services.repository.isRepository() ? "git-repo" : "local-fs"),
    interactionMode: input.interactionMode ?? "human-in-the-loop",
    maxIterations: input.maxIterations ?? 8,
  });

  const contextWithMetadata: CodingAgentContext = {
    ...baseContext,
    connector: {
      ...baseContext.connector,
      ...(input.metadata ? { metadata: input.metadata } : {}),
    },
  };

  return (input.allFeedback ?? []).reduce(
    (context, feedback) => injectFeedback(context, feedback),
    (input.iterations ?? []).reduce(
      (context, iteration) => addIteration(context, iteration),
      contextWithMetadata,
    ),
  );
}

function formatContextValidationErrors(
  errors: Array<{ path: string; message: string }>,
) {
  return errors.map((entry) => `${entry.path}: ${entry.message}`).join(", ");
}

export function getEffectiveCodingAgentContext(
  runtime: RuntimeLike,
  services: AppServices,
  input: EffectiveCodingAgentContextInput,
): CodingAgentContext {
  const nativeContext = getNativeCodingAgent(runtime)?.context?.(
    input.taskDescription,
    {
      sessionId: input.sessionId,
      workingDirectory: input.workspaceRoot,
      maxIterations: input.maxIterations,
      interactionMode: input.interactionMode,
      connectorType: input.connectorType,
      metadata: input.metadata,
      iterations: input.iterations,
      allFeedback: input.allFeedback,
    },
  );

  if (nativeContext) {
    return nativeContext as CodingAgentContext;
  }

  const validated = validateCodingAgentContext(
    createFallbackCodingAgentContext(services, input),
  );
  if (!validated.ok) {
    throw new Error(
      `Invalid effective coding agent context: ${formatContextValidationErrors(
        validated.errors,
      )}`,
    );
  }
  return validated.data;
}

import {
  type CodingAgentContext,
  validateCodingAgentContext,
} from "@elizaos/agent/services/coding-agent-context";
import type { AppServices } from "@/services";
import type { RuntimeLike } from "../runtime-contracts";
import { getNativeCodingAgent } from "./native-services";
import type { EffectiveCodingAgentContextInput } from "./types";

function createFallbackCodingAgentContext(
  services: AppServices,
  input: EffectiveCodingAgentContextInput,
) {
  return {
    sessionId: input.sessionId,
    taskDescription: input.taskDescription,
    workingDirectory: input.workspaceRoot,
    connector: {
      type:
        input.connectorType ??
        (services.repository.isRepository() ? "git-repo" : "local-fs"),
      basePath: input.workspaceRoot,
      available: true,
      metadata: input.metadata,
    },
    interactionMode: input.interactionMode ?? "human-in-the-loop",
    maxIterations: input.maxIterations ?? 8,
    active: true,
    iterations: [],
    allFeedback: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } satisfies Record<string, unknown>;
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

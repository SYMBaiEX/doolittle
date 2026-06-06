import { randomUUID } from "node:crypto";
import {
  addIteration,
  type CodingAgentContext,
  createCodingAgentContext,
  injectFeedback,
  validateCodingAgentContext,
} from "@elizaos/autonomous/services/coding-agent-context";
import type { CodingAgentContextOptions } from "./types";

export interface BuildCodingAgentContextOptions {
  taskDescription: string;
  workspaceRoot: string;
  repositoryAvailable: boolean;
  contextOptions?: CodingAgentContextOptions;
}

export function buildCodingAgentContext(
  options: BuildCodingAgentContextOptions,
): CodingAgentContext {
  const workingDirectory =
    options.contextOptions?.workingDirectory ?? options.workspaceRoot;
  const connectorType =
    options.contextOptions?.connectorType ??
    (options.repositoryAvailable ? "git-repo" : "local-fs");

  const baseContext = createCodingAgentContext({
    sessionId: options.contextOptions?.sessionId ?? randomUUID(),
    taskDescription: options.taskDescription,
    workingDirectory,
    connectorBasePath: workingDirectory,
    connectorType,
    interactionMode:
      options.contextOptions?.interactionMode ?? "human-in-the-loop",
    maxIterations: options.contextOptions?.maxIterations ?? 8,
  });

  const contextWithMetadata: CodingAgentContext = {
    ...baseContext,
    connector: {
      ...baseContext.connector,
      metadata: {
        workspaceRoot: options.workspaceRoot,
        ...(options.contextOptions?.metadata ?? {}),
      },
    },
  };

  const candidate = (options.contextOptions?.allFeedback ?? []).reduce(
    (context, feedback) => injectFeedback(context, feedback),
    (options.contextOptions?.iterations ?? []).reduce(
      (context, iteration) => addIteration(context, iteration),
      contextWithMetadata,
    ),
  );

  const validated = validateCodingAgentContext(candidate);
  if (!validated.ok) {
    throw new Error(
      `Invalid coding agent context: ${validated.errors
        .map((entry) => `${entry.path}: ${entry.message}`)
        .join(", ")}`,
    );
  }

  return validated.data;
}

import { randomUUID } from "node:crypto";
import {
  type CodingAgentContext,
  validateCodingAgentContext,
} from "@elizaos/agent/services/coding-agent-context";
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
  const candidate = {
    sessionId: options.contextOptions?.sessionId ?? randomUUID(),
    taskDescription: options.taskDescription,
    workingDirectory,
    connector: {
      type: connectorType,
      basePath: workingDirectory,
      available: true,
      metadata: {
        workspaceRoot: options.workspaceRoot,
        ...(options.contextOptions?.metadata ?? {}),
      },
    },
    interactionMode:
      options.contextOptions?.interactionMode ?? "human-in-the-loop",
    maxIterations: options.contextOptions?.maxIterations ?? 8,
    active: true,
    iterations: [],
    allFeedback: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } satisfies Record<string, unknown>;

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

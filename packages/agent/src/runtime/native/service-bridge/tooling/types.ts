import type {
  ConnectorType,
  InteractionMode,
} from "@elizaos/agent/services/coding-agent-context";

export interface EffectiveCodingAgentContextInput {
  sessionId: string;
  taskDescription: string;
  workspaceRoot: string;
  maxIterations?: number;
  interactionMode?: InteractionMode;
  connectorType?: ConnectorType;
  metadata?: Record<string, string>;
}

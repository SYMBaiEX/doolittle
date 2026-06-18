import type {
  CodingIteration,
  ConnectorType,
  HumanFeedback,
  InteractionMode,
} from "@elizaos/autonomous/services/coding-agent-context";

export interface EffectiveCodingAgentContextInput {
  sessionId: string;
  taskDescription: string;
  workspaceRoot: string;
  maxIterations?: number;
  interactionMode?: InteractionMode;
  connectorType?: ConnectorType;
  metadata?: Record<string, string>;
  iterations?: CodingIteration[];
  allFeedback?: HumanFeedback[];
}

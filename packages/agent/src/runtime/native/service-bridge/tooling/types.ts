import type {
  CodingIteration,
  ConnectorType,
  HumanFeedback,
  InteractionMode,
} from "@doolittle/contracts";

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

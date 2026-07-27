// Convenience aliases over the ElizaOS SDK trajectory record types.
//
// As of the 2.0 beta line these records live in `@elizaos/core` (they were
// previously re-exported through `@elizaos/agent/types/trajectory`). The
// `Sdk*` names below preserve the friendlier shape the rest of the Doolittle
// trajectory layer consumes.
export type SdkTrajectoryLlmCall = {
  callId: string;
  timestamp: number;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  response: string;
  temperature: number;
  maxTokens: number;
  purpose: string;
};
export type SdkTrajectoryProviderAccess = {
  providerId: string;
  providerName: string;
  timestamp: number;
  data: Record<string, unknown>;
  purpose: string;
};
export type SdkTrajectoryStep = {
  stepId: string;
  stepNumber: number;
  llmCalls: SdkTrajectoryLlmCall[];
  providerAccesses: SdkTrajectoryProviderAccess[];
};
export type SdkTrajectory = {
  trajectoryId: string;
  agentId: string;
  steps: SdkTrajectoryStep[];
  metrics: { finalStatus: SdkTrajectoryStatus };
};
export type SdkTrajectoryExportOptions = {
  format: "json" | "art" | "csv";
  includePrompts?: boolean;
  trajectoryIds?: string[];
  startDate?: string;
  endDate?: string;
  scenarioId?: string;
  batchId?: string;
};
export type SdkTrajectoryExportResult = {
  data: string;
  filename: string;
  mimeType: string;
};
export type SdkTrajectoryListItem = {
  id: string;
  agentId: string;
  source: string;
  status: "active" | "completed" | "error" | "timeout";
  createdAt: string;
  llmCallCount: number;
};
export type SdkTrajectoryListOptions = {
  limit?: number;
  offset?: number;
  status?: SdkTrajectoryListItem["status"];
  source?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  scenarioId?: string;
  batchId?: string;
  isTrainingData?: boolean;
};
export type SdkTrajectoryListResult = {
  trajectories: SdkTrajectoryListItem[];
  total: number;
  offset: number;
  limit: number;
};
export type SdkTrajectoryStatus =
  | "completed"
  | "terminated"
  | "error"
  | "timeout";
export type SdkTrajectoryStepId = string;
export type SdkTrajectoryStepKind = "llm" | "action" | "executeCode";
export type SdkTrajectoryCacheStats = {
  totalTrajectories: number;
  totalSteps: number;
  totalLlmCalls: number;
};
export type SdkTrajectoryFlattenedLlmCall = SdkTrajectoryLlmCall;

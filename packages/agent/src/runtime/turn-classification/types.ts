import type { RunDepth, ToolProgressMode } from "@/types/runtime";

export interface TurnClassification {
  simpleChat: boolean;
  likelyLocalTask: boolean;
  requiresFullContext: boolean;
  actionOriented: boolean;
  informationalOnly: boolean;
  shouldUseMultiStep: boolean;
}

export type AgentContextScope = "minimal" | "local" | "full";
export type TurnCapabilityProfile = "minimal" | "coding" | "messaging" | "full";

export interface TurnExecutionPolicy {
  runDepth: RunDepth;
  maxIterations: number;
  toolProgressMode: ToolProgressMode;
  useMultiStep: boolean;
}

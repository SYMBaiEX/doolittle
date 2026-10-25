export interface UserProfileRecallHit {
  kind:
    | "displayName"
    | "preference"
    | "fact"
    | "belief"
    | "goal"
    | "context"
    | "constraint"
    | "relationship"
    | "engagement"
    | "memory"
    | "tool"
    | "workStyle"
    | "alias"
    | "note";
  value: string;
  score: number;
}

export type RememberKind =
  | "preference"
  | "fact"
  | "belief"
  | "goal"
  | "context"
  | "constraint"
  | "relationship"
  | "note"
  | "memory";

export interface UserProfileMutationHost {
  nowIso(): string;
  unique(items: string[]): string[];
  normalizeRelationship(
    relationship?: import("../../types/index").UserProfileRecord["relationship"],
  ): NonNullable<import("../../types/index").UserProfileRecord["relationship"]>;
}

export interface UserProfileMutationActions {
  seedAgent(seed: {
    name?: string;
    goals?: string[];
    strengths?: string[];
    workStyle?: string[];
    notes?: string[];
  }): import("../../types/index").AgentIdentityRecord;
  setMode(
    userId: string,
    mode: import("../../types/index").UserProfileRecord["memoryMode"],
    context?: import("./storage").UserProfileInteractionContext,
  ): import("../../types/index").UserProfileRecord;
  configureModeling(
    userId: string,
    settings: {
      userMemoryMode?: "local" | "hybrid";
      assistantMemoryMode?: "local" | "hybrid";
      dialecticMode?: "off" | "assist" | "conclude";
    },
    context?: import("./storage").UserProfileInteractionContext,
  ): import("../../types/index").UserProfileRecord;
  addNote(
    userId: string,
    note: string,
    source?: string,
    context?: import("./storage").UserProfileInteractionContext,
  ): import("../../types/index").UserProfileRecord;
  remember(
    userId: string,
    kind: RememberKind,
    value: string,
    source?: string,
    context?: import("./storage").UserProfileInteractionContext,
  ): import("../../types/index").UserProfileRecord;
  setExplicitMemories(
    userId: string,
    memories: string[],
    source?: string,
  ): import("../../types/index").UserProfileRecord;
  observe(
    userId: string,
    message: string,
    source?: string,
    context?: import("./storage").UserProfileInteractionContext,
  ): import("../../types/index").UserProfileRecord;
  observeAgent(
    note: string,
    source?: string,
  ): import("../../types/index").AgentIdentityRecord;
  conclude(
    userId: string,
    query: string,
    conclusion: string,
    source?: string,
  ): import("../../types/index").UserProfileConclusionRecord;
}

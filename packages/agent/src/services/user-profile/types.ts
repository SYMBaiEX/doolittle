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
    relationship?: import("@/types").UserProfileRecord["relationship"],
  ): NonNullable<import("@/types").UserProfileRecord["relationship"]>;
}

export interface UserProfileMutationActions {
  seedAgent(seed: {
    name?: string;
    goals?: string[];
    strengths?: string[];
    workStyle?: string[];
    notes?: string[];
  }): import("@/types").AgentIdentityRecord;
  setMode(
    userId: string,
    mode: import("@/types").UserProfileRecord["memoryMode"],
    context?: import("./storage").UserProfileInteractionContext,
  ): import("@/types").UserProfileRecord;
  configureModeling(
    userId: string,
    settings: {
      userMemoryMode?: "local" | "hybrid";
      assistantMemoryMode?: "local" | "hybrid";
      dialecticMode?: "off" | "assist" | "conclude";
    },
    context?: import("./storage").UserProfileInteractionContext,
  ): import("@/types").UserProfileRecord;
  addNote(
    userId: string,
    note: string,
    source?: string,
    context?: import("./storage").UserProfileInteractionContext,
  ): import("@/types").UserProfileRecord;
  remember(
    userId: string,
    kind: RememberKind,
    value: string,
    source?: string,
    context?: import("./storage").UserProfileInteractionContext,
  ): import("@/types").UserProfileRecord;
  observe(
    userId: string,
    message: string,
    source?: string,
    context?: import("./storage").UserProfileInteractionContext,
  ): import("@/types").UserProfileRecord;
  observeAgent(
    note: string,
    source?: string,
  ): import("@/types").AgentIdentityRecord;
  conclude(
    userId: string,
    query: string,
    conclusion: string,
    source?: string,
  ): import("@/types").UserProfileConclusionRecord;
}

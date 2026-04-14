export interface ParsedUserObservation {
  lower: string;
  preference?: string;
  belief?: string;
  fact?: string;
  alias?: string;
  goal?: string;
  projectContext?: string;
  constraint?: string;
  workStyle?: string;
  toolSignals: string[];
  relationshipNote: boolean;
  relationshipSignals: number;
  isExplicitMemory: boolean;
}

export interface ParsedAgentObservation {
  goal?: string;
  strength?: string;
  workStyle?: string;
}

export interface UserProfileObservationHost {
  nowIso(): string;
  unique(items: string[]): string[];
  normalizeRelationship(
    relationship?: import("@/types").UserProfileRecord["relationship"],
  ): NonNullable<import("@/types").UserProfileRecord["relationship"]>;
}

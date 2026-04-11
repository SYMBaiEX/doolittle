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

export interface UserProfileBeliefSummary {
  userId: string;
  displayName?: string;
  count: number;
  sourceCount: number;
  beliefs: string[];
  sources: string[];
}

export interface UserProfileRelationshipSummary {
  userId: string;
  displayName?: string;
  status: "new" | "growing" | "active" | "trusted";
  trust: number;
  collaboration: number;
  noteCount: number;
  notes: string[];
  lastInteractionAt?: string;
  lastSource?: string;
}

export interface UserProfileEngagementSummary {
  userId: string;
  displayName?: string;
  touches: number;
  channelCount: number;
  sourceCount: number;
  sessionCount: number;
  recentSignalCount: number;
  channels: string[];
  sources: string[];
  sessionIds: string[];
  recentSignals: string[];
  lastInteractionAt?: string;
  lastSource?: string;
}

export interface UserProfileSearchHit {
  userId: string;
  displayName?: string;
  score: number;
  matchedFields: string[];
  preview: string[];
  relationshipStatus?: "new" | "growing" | "active" | "trusted";
  trust?: number;
  collaboration?: number;
  touches?: number;
  channels?: string[];
  lastInteractionAt?: string;
  lastSource?: string;
}

export interface UserProfileWorkspaceSummary {
  totalProfiles: number;
  agentName: string;
  recentProfiles: string[];
  totalBeliefs: number;
  totalBeliefSources: number;
  activeRelationships: number;
  trustedRelationships: number;
  engagedProfiles: number;
  relationshipStatusCounts: {
    new: number;
    growing: number;
    active: number;
    trusted: number;
  };
  topBeliefProfiles: Array<{
    userId: string;
    displayName?: string;
    beliefCount: number;
    sourceCount: number;
    beliefs: string[];
    sources: string[];
  }>;
  topRelationships: Array<{
    userId: string;
    displayName?: string;
    status: "new" | "growing" | "active" | "trusted";
    trust: number;
    collaboration: number;
    lastInteractionAt?: string;
    lastSource?: string;
  }>;
  topEngagements: Array<{
    userId: string;
    displayName?: string;
    touches: number;
    channels: string[];
    sources: string[];
    sessionIds: string[];
    recentSignals: string[];
    lastInteractionAt?: string;
    lastSource?: string;
  }>;
  topChannels: Array<{
    channel: string;
    count: number;
  }>;
  topSignals: Array<{
    signal: string;
    count: number;
    userIds: string[];
  }>;
  recentSignals: string[];
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

export interface UserProfileRecord {
  userId: string;
  displayName?: string;
  memoryMode?: "local" | "hybrid";
  userMemoryMode?: "local" | "hybrid";
  assistantMemoryMode?: "local" | "hybrid";
  dialecticMode?: "off" | "assist" | "conclude";
  preferences: string[];
  facts: string[];
  beliefs: string[];
  beliefSources: string[];
  notes: string[];
  lastSource?: string;
  lastSeenAt: string;
}

export interface UserProfileServiceLike {
  card(userId: string): string;
  remember(
    userId: string,
    kind: RememberKind,
    value: string,
    source?: string,
  ): UserProfileRecord;
  recall(userId: string, query: string, limit?: number): UserProfileRecallHit[];
  observeAgent(
    note: string,
    source?: string,
  ): {
    name: string;
    notes: string[];
    goals: string[];
    strengths: string[];
    workStyle: string[];
    lastSource?: string;
    updatedAt: string;
  };
  agentProfile(): string;
  search(query: string, limit?: number): UserProfileSearchHit[];
  beliefs(userId: string): UserProfileBeliefSummary;
  relationship(userId: string): UserProfileRelationshipSummary;
  engagement(userId: string): UserProfileEngagementSummary;
  summary(): UserProfileWorkspaceSummary;
}

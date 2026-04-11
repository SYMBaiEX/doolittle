export interface PersonalityProfile {
  id: string;
  name: string;
  description: string;
  systemAddendum: string;
}

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
  aliases?: string[];
  goals?: string[];
  projectContext?: string[];
  constraints?: string[];
  explicitMemories?: string[];
  toolPreferences?: string[];
  workStyle?: string[];
  relationship?: UserProfileRelationshipRecord;
  engagement?: UserProfileEngagementRecord;
  lastSource?: string;
  lastSeenAt: string;
  updatedAt: string;
}

export interface UserProfileRelationshipRecord {
  status: "new" | "growing" | "active" | "trusted";
  trust: number;
  collaboration: number;
  notes: string[];
  lastInteractionAt?: string;
  lastSource?: string;
}

export interface UserProfileEngagementRecord {
  touches: number;
  channels: string[];
  sources: string[];
  sessionIds: string[];
  recentSignals: string[];
  lastInteractionAt?: string;
  lastSource?: string;
}

export interface AgentIdentityRecord {
  name: string;
  notes: string[];
  goals: string[];
  strengths: string[];
  workStyle: string[];
  lastSource?: string;
  updatedAt: string;
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

export interface UserProfileContextSummary {
  userId: string;
  displayName?: string;
  query: string;
  answer: string;
  evidence: string[];
  userMemoryMode: "local" | "hybrid";
  assistantMemoryMode: "local" | "hybrid";
  dialecticMode: "off" | "assist" | "conclude";
}

export interface UserProfileConclusionRecord {
  userId: string;
  query: string;
  conclusion: string;
  source?: string;
  recordedAt: string;
}

export interface UserProfileWorkspaceRelationshipSummary {
  userId: string;
  displayName?: string;
  status: "new" | "growing" | "active" | "trusted";
  trust: number;
  collaboration: number;
  lastInteractionAt?: string;
  lastSource?: string;
}

export interface UserProfileWorkspaceEngagementSummary {
  userId: string;
  displayName?: string;
  touches: number;
  channels: string[];
  sources: string[];
  sessionIds: string[];
  recentSignals: string[];
  lastInteractionAt?: string;
  lastSource?: string;
}

export interface UserProfileWorkspaceBeliefSummary {
  userId: string;
  displayName?: string;
  beliefCount: number;
  sourceCount: number;
  beliefs: string[];
  sources: string[];
}

export interface UserProfileWorkspaceSignalSummary {
  signal: string;
  count: number;
  userIds: string[];
}

export interface UserProfileWorkspaceChannelSummary {
  channel: string;
  count: number;
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
  topBeliefProfiles: UserProfileWorkspaceBeliefSummary[];
  topRelationships: UserProfileWorkspaceRelationshipSummary[];
  topEngagements: UserProfileWorkspaceEngagementSummary[];
  topChannels: UserProfileWorkspaceChannelSummary[];
  topSignals: UserProfileWorkspaceSignalSummary[];
  recentSignals: string[];
}

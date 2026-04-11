import type {
  UserProfileBeliefSummary,
  UserProfileEngagementSummary,
  UserProfileRecord,
  UserProfileRelationshipSummary,
} from "@/types";
import { normalizeEngagement, normalizeRelationship } from "./storage";

export interface UserProfileSummaryReader {
  get(userId: string): UserProfileRecord;
}

export function buildBeliefSummary(
  reader: UserProfileSummaryReader,
  userId: string,
): UserProfileBeliefSummary {
  const profile = reader.get(userId);
  return {
    userId,
    displayName: profile.displayName,
    count: profile.beliefs?.length ?? 0,
    sourceCount: profile.beliefSources?.length ?? 0,
    beliefs: profile.beliefs ?? [],
    sources: profile.beliefSources ?? [],
  };
}

export function buildRelationshipSummary(
  reader: UserProfileSummaryReader,
  userId: string,
): UserProfileRelationshipSummary {
  const profile = reader.get(userId);
  const relationship = normalizeRelationship(profile.relationship);
  return {
    userId,
    displayName: profile.displayName,
    status: relationship.status,
    trust: relationship.trust,
    collaboration: relationship.collaboration,
    noteCount: relationship.notes.length,
    notes: relationship.notes,
    lastInteractionAt: relationship.lastInteractionAt,
    lastSource: relationship.lastSource,
  };
}

export function buildEngagementSummary(
  reader: UserProfileSummaryReader,
  userId: string,
): UserProfileEngagementSummary {
  const profile = reader.get(userId);
  const engagement = normalizeEngagement(profile.engagement);
  return {
    userId,
    displayName: profile.displayName,
    touches: engagement.touches,
    channelCount: engagement.channels.length,
    sourceCount: engagement.sources.length,
    sessionCount: engagement.sessionIds.length,
    recentSignalCount: engagement.recentSignals.length,
    channels: engagement.channels,
    sources: engagement.sources,
    sessionIds: engagement.sessionIds,
    recentSignals: engagement.recentSignals,
    lastInteractionAt: engagement.lastInteractionAt,
    lastSource: engagement.lastSource,
  };
}

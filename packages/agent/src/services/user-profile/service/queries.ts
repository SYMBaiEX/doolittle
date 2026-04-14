import type {
  AgentIdentityRecord,
  UserProfileBeliefSummary,
  UserProfileContextSummary,
  UserProfileEngagementSummary,
  UserProfileRecord,
  UserProfileRelationshipSummary,
  UserProfileSearchHit,
} from "@/types";
import {
  context as getUserProfileContext,
  recall as getUserProfileRecall,
  type ProfileReader,
} from "../insights";
import { searchProfiles, type UserProfileSearchReader } from "../search";
import type { UserProfileStorage } from "../storage";
import { createEmptyProfile } from "../storage";
import {
  buildBeliefSummary,
  buildEngagementSummary,
  buildRelationshipSummary,
  type UserProfileSummaryReader,
} from "../summaries";
import type { UserProfileRecallHit } from "../types";

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

export function listUserProfiles(
  storage: UserProfileStorage,
): UserProfileRecord[] {
  return storage
    .read()
    .profiles.slice()
    .map(cloneValue)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getUserProfile(
  storage: UserProfileStorage,
  userId: string,
): UserProfileRecord {
  const existing = storage
    .read()
    .profiles.find((profile) => profile.userId === userId);
  return existing ? cloneValue(existing) : createEmptyProfile(userId);
}

export function getAgentProfile(
  storage: UserProfileStorage,
): AgentIdentityRecord {
  return cloneValue(storage.read().agent);
}

export function getBeliefSummary(
  reader: UserProfileSummaryReader,
  userId: string,
): UserProfileBeliefSummary {
  return buildBeliefSummary(reader, userId);
}

export function getRelationshipSummary(
  reader: UserProfileSummaryReader,
  userId: string,
): UserProfileRelationshipSummary {
  return buildRelationshipSummary(reader, userId);
}

export function getEngagementSummary(
  reader: UserProfileSummaryReader,
  userId: string,
): UserProfileEngagementSummary {
  return buildEngagementSummary(reader, userId);
}

export function searchUserProfiles(
  reader: UserProfileSearchReader,
  query: string,
  limit = 10,
): UserProfileSearchHit[] {
  return searchProfiles(reader, query, limit);
}

export function recallUserProfileContext(
  reader: ProfileReader,
  userId: string,
  query: string,
  limit = 8,
): UserProfileRecallHit[] {
  return getUserProfileRecall(reader, userId, query, limit);
}

export function buildUserProfileContext(
  reader: ProfileReader,
  userId: string,
  query: string,
): UserProfileContextSummary {
  return getUserProfileContext(reader, userId, query);
}

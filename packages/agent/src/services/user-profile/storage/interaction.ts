import type { UserProfileRecord } from "@/types";
import { nowIso, unique } from "../shared";
import { normalizeEngagement, normalizeRelationship } from "./normalization";
import type { UserProfileInteractionContext } from "./types";

export function recordInteraction(
  profile: UserProfileRecord,
  context?: UserProfileInteractionContext,
): void {
  const engagement = normalizeEngagement(profile.engagement);
  engagement.touches += 1;
  const channel = context?.channel ?? context?.source;
  if (channel) {
    engagement.channels = unique([...engagement.channels, channel]);
  }
  if (context?.source) {
    engagement.sources = unique([...engagement.sources, context.source]);
    profile.lastSource = context.source;
    engagement.lastSource = context.source;
  }
  if (context?.sessionId) {
    engagement.sessionIds = unique([
      ...engagement.sessionIds,
      context.sessionId,
    ]);
  }
  if (context?.signal) {
    engagement.recentSignals = unique([
      ...engagement.recentSignals,
      context.signal,
    ]).slice(-10);
  }
  engagement.lastInteractionAt = nowIso();
  profile.engagement = normalizeEngagement(engagement);
  profile.relationship = normalizeRelationship({
    ...normalizeRelationship(profile.relationship),
    lastInteractionAt: engagement.lastInteractionAt,
    lastSource: engagement.lastSource ?? profile.relationship?.lastSource,
  });
}

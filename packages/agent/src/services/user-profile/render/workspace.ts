import type { UserProfileRecord, UserProfileWorkspaceSummary } from "@/types";
import { unique } from "../shared";
import { normalizeEngagement, normalizeRelationship } from "../storage";
import type { ProfileRenderReader } from "./reader";

interface EnrichedProfileEntry {
  profile: UserProfileRecord;
  relationship: NonNullable<UserProfileRecord["relationship"]>;
  engagement: NonNullable<UserProfileRecord["engagement"]>;
  beliefCount: number;
  beliefSourceCount: number;
}

function enrichProfiles(profiles: UserProfileRecord[]): EnrichedProfileEntry[] {
  return profiles.map((profile) => ({
    profile,
    relationship: normalizeRelationship(profile.relationship),
    engagement: normalizeEngagement(profile.engagement),
    beliefCount: profile.beliefs?.length ?? 0,
    beliefSourceCount: profile.beliefSources?.length ?? 0,
  }));
}

export function buildWorkspaceSummary(
  reader: ProfileRenderReader,
): UserProfileWorkspaceSummary {
  const profiles = reader.list();
  const agent = reader.getAgent();
  const enriched = enrichProfiles(profiles);

  const totalBeliefs = enriched.reduce(
    (sum, entry) => sum + entry.beliefCount,
    0,
  );
  const totalBeliefSources = enriched.reduce(
    (sum, entry) => sum + entry.beliefSourceCount,
    0,
  );
  const relationshipStatusCounts = enriched.reduce(
    (counts, entry) => {
      counts[entry.relationship.status] += 1;
      return counts;
    },
    {
      new: 0,
      growing: 0,
      active: 0,
      trusted: 0,
    } as UserProfileWorkspaceSummary["relationshipStatusCounts"],
  );
  const activeRelationships = enriched.filter(
    (entry) => entry.relationship.status !== "new",
  ).length;
  const trustedRelationships = enriched.filter(
    (entry) => entry.relationship.status === "trusted",
  ).length;
  const engagedProfiles = enriched.filter(
    (entry) => entry.engagement.touches > 0,
  ).length;

  const signalCounts = new Map<
    string,
    { count: number; userIds: Set<string> }
  >();
  const channelCounts = new Map<string, number>();
  for (const entry of enriched) {
    for (const signal of entry.engagement.recentSignals.slice(-3)) {
      const key = signal.trim();
      if (!key) continue;
      const current = signalCounts.get(key) ?? {
        count: 0,
        userIds: new Set<string>(),
      };
      current.count += 1;
      current.userIds.add(entry.profile.userId);
      signalCounts.set(key, current);
    }
    for (const channel of entry.engagement.channels) {
      const key = channel.trim();
      if (!key) continue;
      channelCounts.set(key, (channelCounts.get(key) ?? 0) + 1);
    }
  }

  const recentSignals = unique(
    enriched.flatMap((entry) => entry.engagement.recentSignals.slice(-2)),
  ).slice(-5);

  return {
    totalProfiles: profiles.length,
    agentName: agent.name,
    recentProfiles: profiles.slice(0, 5).map((profile) => profile.userId),
    totalBeliefs,
    totalBeliefSources,
    activeRelationships,
    trustedRelationships,
    engagedProfiles,
    relationshipStatusCounts,
    topBeliefProfiles: enriched
      .slice()
      .sort(
        (left, right) =>
          right.beliefCount - left.beliefCount ||
          right.beliefSourceCount - left.beliefSourceCount ||
          right.profile.updatedAt.localeCompare(left.profile.updatedAt),
      )
      .filter((entry) => entry.beliefCount > 0 || entry.beliefSourceCount > 0)
      .slice(0, 5)
      .map((entry) => ({
        userId: entry.profile.userId,
        displayName: entry.profile.displayName,
        beliefCount: entry.beliefCount,
        sourceCount: entry.beliefSourceCount,
        beliefs: entry.profile.beliefs ?? [],
        sources: entry.profile.beliefSources ?? [],
      })),
    topRelationships: enriched
      .slice()
      .sort(
        (left, right) =>
          right.relationship.trust +
            right.relationship.collaboration -
            (left.relationship.trust + left.relationship.collaboration) ||
          right.engagement.touches - left.engagement.touches ||
          right.profile.updatedAt.localeCompare(left.profile.updatedAt),
      )
      .filter(
        (entry) =>
          entry.relationship.status !== "new" ||
          entry.relationship.trust > 0 ||
          entry.relationship.collaboration > 0,
      )
      .slice(0, 5)
      .map((entry) => ({
        userId: entry.profile.userId,
        displayName: entry.profile.displayName,
        status: entry.relationship.status,
        trust: entry.relationship.trust,
        collaboration: entry.relationship.collaboration,
        lastInteractionAt: entry.relationship.lastInteractionAt,
        lastSource: entry.relationship.lastSource,
      })),
    topEngagements: enriched
      .slice()
      .sort(
        (left, right) =>
          right.engagement.touches - left.engagement.touches ||
          right.engagement.recentSignals.length -
            left.engagement.recentSignals.length ||
          right.profile.updatedAt.localeCompare(left.profile.updatedAt),
      )
      .filter((entry) => entry.engagement.touches > 0)
      .slice(0, 5)
      .map((entry) => ({
        userId: entry.profile.userId,
        displayName: entry.profile.displayName,
        touches: entry.engagement.touches,
        channels: entry.engagement.channels,
        sources: entry.engagement.sources,
        sessionIds: entry.engagement.sessionIds,
        recentSignals: entry.engagement.recentSignals,
        lastInteractionAt: entry.engagement.lastInteractionAt,
        lastSource: entry.engagement.lastSource,
      })),
    topChannels: Array.from(channelCounts.entries())
      .sort(
        (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
      )
      .slice(0, 5)
      .map(([channel, count]) => ({ channel, count })),
    topSignals: Array.from(signalCounts.entries())
      .sort(
        (left, right) =>
          right[1].count - left[1].count || left[0].localeCompare(right[0]),
      )
      .slice(0, 5)
      .map(([signal, entry]) => ({
        signal,
        count: entry.count,
        userIds: Array.from(entry.userIds).sort(),
      })),
    recentSignals,
  };
}

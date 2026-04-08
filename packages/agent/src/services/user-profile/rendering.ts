import type {
  AgentIdentityRecord,
  UserProfileBeliefSummary,
  UserProfileEngagementSummary,
  UserProfileRecord,
  UserProfileRelationshipSummary,
  UserProfileWorkspaceSummary,
} from "@/types";

export interface ProfileRenderReader {
  list(): UserProfileRecord[];
  get(userId: string): UserProfileRecord;
  getAgent(): AgentIdentityRecord;
  beliefs(userId: string): UserProfileBeliefSummary;
  relationship(userId: string): UserProfileRelationshipSummary;
  engagement(userId: string): UserProfileEngagementSummary;
}

function unique(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function scoreCadence(touches: number): "low" | "steady" | "high" {
  if (touches >= 15) {
    return "high";
  }
  if (touches >= 4) {
    return "steady";
  }
  return "low";
}

function normalizeRelationship(
  relationship?: UserProfileRecord["relationship"],
): NonNullable<UserProfileRecord["relationship"]> {
  const next: NonNullable<UserProfileRecord["relationship"]> = {
    status: "new",
    trust: 0,
    collaboration: 0,
    notes: [] as string[],
    ...(relationship ?? {}),
    ...(relationship ? { notes: relationship.notes ?? [] } : {}),
  };
  const score = next.trust + next.collaboration;
  if (score >= 12 || next.trust >= 8) {
    next.status = "trusted";
  } else if (score >= 6 || next.trust >= 4) {
    next.status = "active";
  } else if (score > 0 || next.collaboration > 0) {
    next.status = "growing";
  } else {
    next.status = "new";
  }
  return next;
}

function normalizeEngagement(
  engagement?: UserProfileRecord["engagement"],
): NonNullable<UserProfileRecord["engagement"]> {
  return {
    touches: 0,
    channels: [],
    sources: [],
    sessionIds: [],
    recentSignals: [],
    ...(engagement ?? {}),
    ...(engagement
      ? {
          channels: engagement.channels ?? [],
          sources: engagement.sources ?? [],
          sessionIds: engagement.sessionIds ?? [],
          recentSignals: engagement.recentSignals ?? [],
        }
      : {}),
  };
}

function renderSection(title: string, items: string[]): string[] {
  return [
    title,
    ...(items.length ? items.map((item) => `- ${item}`) : ["- (none)"]),
  ];
}

export function render(reader: ProfileRenderReader, userId: string): string {
  const profile = reader.get(userId);
  const relationship = reader.relationship(userId);
  const engagement = reader.engagement(userId);
  const beliefs = reader.beliefs(userId);

  return [
    `USER PROFILE: ${profile.displayName ?? profile.userId}`,
    `User memory: ${profile.userMemoryMode ?? profile.memoryMode ?? "hybrid"}`,
    `Assistant memory: ${profile.assistantMemoryMode ?? profile.memoryMode ?? "hybrid"}`,
    `Dialectic mode: ${profile.dialecticMode ?? "assist"}`,
    `Last seen: ${profile.lastSeenAt}`,
    `Source: ${profile.lastSource ?? "unknown"}`,
    "",
    ...renderSection("Preferences", profile.preferences),
    "",
    ...renderSection("Goals", profile.goals ?? []),
    "",
    ...renderSection(
      "Beliefs",
      beliefs.beliefs.map(
        (item, index) =>
          `${item}${beliefs.sources[index] ? ` [${beliefs.sources[index]}]` : ""}`,
      ),
    ),
    "",
    ...renderSection("Project Context", profile.projectContext ?? []),
    "",
    ...renderSection("Constraints", profile.constraints ?? []),
    "",
    ...renderSection("Tools", profile.toolPreferences ?? []),
    "",
    ...renderSection("Work Style", profile.workStyle ?? []),
    "",
    `Relationship: ${relationship.status} trust=${relationship.trust}/10 collaboration=${relationship.collaboration}/10`,
    ...(relationship.notes.length
      ? relationship.notes.slice(-5).map((item) => `- ${item}`)
      : ["- (none)"]),
    "",
    `Engagement: touches=${engagement.touches} cadence=${scoreCadence(engagement.touches)}`,
    `Channels: ${engagement.channels.length ? engagement.channels.join(", ") : "none"}`,
    `Sources: ${engagement.sources.length ? engagement.sources.join(", ") : "none"}`,
    ...(engagement.recentSignals.length
      ? engagement.recentSignals.slice(-5).map((item) => `- ${item}`)
      : ["- (none)"]),
    "",
    ...renderSection("Aliases", profile.aliases ?? []),
    "",
    ...renderSection("Facts", profile.facts),
    "",
    ...renderSection("Explicit Memories", profile.explicitMemories ?? []),
    "",
    ...renderSection("Notes", profile.notes),
  ].join("\n");
}

export function renderAgent(reader: ProfileRenderReader): string {
  const agent = reader.getAgent();
  return [
    `AGENT PROFILE: ${agent.name}`,
    `Updated: ${agent.updatedAt}`,
    `Source: ${agent.lastSource ?? "unknown"}`,
    "",
    ...renderSection("Goals", agent.goals),
    "",
    ...renderSection("Strengths", agent.strengths),
    "",
    ...renderSection("Work Style", agent.workStyle),
    "",
    ...renderSection("Notes", agent.notes),
  ].join("\n");
}

export function renderCards(
  reader: ProfileRenderReader,
  userId: string,
): string {
  return `${render(reader, userId)}\n\n${renderAgent(reader)}`;
}

export function summary(
  reader: ProfileRenderReader,
): UserProfileWorkspaceSummary {
  const profiles = reader.list();
  const agent = reader.getAgent();

  const enriched = profiles.map((profile) => {
    const relationship = normalizeRelationship(profile.relationship);
    const engagement = normalizeEngagement(profile.engagement);
    return {
      profile,
      relationship,
      engagement,
      beliefCount: profile.beliefs?.length ?? 0,
      beliefSourceCount: profile.beliefSources?.length ?? 0,
    };
  });

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

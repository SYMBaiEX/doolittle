import type { ProfileRenderReader } from "./reader";

function scoreCadence(touches: number): "low" | "steady" | "high" {
  if (touches >= 15) {
    return "high";
  }
  if (touches >= 4) {
    return "steady";
  }
  return "low";
}

function renderSection(title: string, items: string[]): string[] {
  return [
    title,
    ...(items.length ? items.map((item) => `- ${item}`) : ["- (none)"]),
  ];
}

export function renderUserProfile(
  reader: ProfileRenderReader,
  userId: string,
): string {
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

export function renderAgentProfile(reader: ProfileRenderReader): string {
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

export function renderUserProfileCards(
  reader: ProfileRenderReader,
  userId: string,
): string {
  return `${renderUserProfile(reader, userId)}\n\n${renderAgentProfile(reader)}`;
}

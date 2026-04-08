import { describe, expect, it } from "bun:test";
import type {
  AgentIdentityRecord,
  UserProfileEngagementSummary,
  UserProfileRecord,
  UserProfileRelationshipSummary,
} from "@/types";
import {
  type ProfileRenderReader,
  render,
  renderAgent,
  renderCards,
  summary,
} from "./rendering";

const fixedProfile: UserProfileRecord = {
  userId: "u-1",
  displayName: "Ada",
  memoryMode: "hybrid",
  userMemoryMode: "local",
  assistantMemoryMode: "hybrid",
  dialecticMode: "assist",
  preferences: ["fast responses"],
  facts: ["likes bun"],
  beliefs: ["Bun-first default", "Synchronous tool calls"],
  beliefSources: ["cli", "notes"],
  notes: ["Prefers concise output"],
  aliases: ["A"],
  goals: ["Ship clean APIs"],
  projectContext: ["Doolittle refactor"],
  constraints: ["No markdown for logs"],
  explicitMemories: ["Remember to prioritize tests"],
  toolPreferences: ["Bun", "Docker"],
  workStyle: ["Step-by-step"],
  relationship: {
    status: "active",
    trust: 6,
    collaboration: 5,
    notes: ["Teamwork is positive"],
    lastInteractionAt: "2026-01-01T00:00:00.000Z",
    lastSource: "cli",
  },
  engagement: {
    touches: 9,
    channels: ["cli", "web"],
    sources: ["session"],
    sessionIds: ["s-1"],
    recentSignals: ["plan", "ship", "ship"],
    lastInteractionAt: "2026-01-01T00:00:00.000Z",
    lastSource: "cli",
  },
  lastSource: "cli",
  lastSeenAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const secondProfile: UserProfileRecord = {
  ...fixedProfile,
  userId: "u-2",
  displayName: "Bryn",
  lastSeenAt: "2026-01-01T01:00:00.000Z",
  updatedAt: "2026-01-01T01:00:00.000Z",
  memoryMode: "local",
  userMemoryMode: "local",
  assistantMemoryMode: "local",
  beliefs: [],
  beliefSources: [],
  relationship: {
    status: "new",
    trust: 0,
    collaboration: 0,
    notes: [],
  },
  engagement: {
    touches: 0,
    channels: [],
    sources: [],
    sessionIds: [],
    recentSignals: [],
  },
};

const agent: AgentIdentityRecord = {
  name: "Doolittle",
  notes: ["Modeling stable"],
  goals: ["Ship operator tooling"],
  strengths: ["TypeScript refactor"],
  workStyle: ["Keep seams small"],
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function createReader(): ProfileRenderReader {
  const profiles = [fixedProfile, secondProfile];
  const map = new Map(profiles.map((entry) => [entry.userId, entry]));

  return {
    list: () => profiles,
    get: (userId) => map.get(userId) ?? fixedProfile,
    getAgent: () => agent,
    beliefs: (userId) => {
      const profile = map.get(userId);
      if (!profile) {
        return {
          userId,
          displayName: undefined,
          count: 0,
          sourceCount: 0,
          beliefs: [],
          sources: [],
        };
      }
      return {
        userId,
        displayName: profile.displayName,
        count: profile.beliefs.length,
        sourceCount: profile.beliefSources.length,
        beliefs: profile.beliefs,
        sources: profile.beliefSources,
      };
    },
    relationship: (userId) => {
      const profile = map.get(userId);
      return {
        userId,
        displayName: profile?.displayName,
        status: profile?.relationship?.status ?? "new",
        trust: profile?.relationship?.trust ?? 0,
        collaboration: profile?.relationship?.collaboration ?? 0,
        noteCount: profile?.relationship?.notes.length ?? 0,
        notes: profile?.relationship?.notes ?? [],
        lastInteractionAt: profile?.relationship?.lastInteractionAt,
        lastSource: profile?.relationship?.lastSource,
      } satisfies UserProfileRelationshipSummary;
    },
    engagement: (userId) => {
      const profile = map.get(userId);
      return {
        userId,
        displayName: profile?.displayName,
        touches: profile?.engagement?.touches ?? 0,
        channelCount: profile?.engagement?.channels.length ?? 0,
        sourceCount: profile?.engagement?.sources.length ?? 0,
        sessionCount: profile?.engagement?.sessionIds.length ?? 0,
        recentSignalCount: profile?.engagement?.recentSignals.length ?? 0,
        channels: profile?.engagement?.channels ?? [],
        sources: profile?.engagement?.sources ?? [],
        sessionIds: profile?.engagement?.sessionIds ?? [],
        recentSignals: profile?.engagement?.recentSignals ?? [],
        lastInteractionAt: profile?.engagement?.lastInteractionAt,
        lastSource: profile?.engagement?.lastSource,
      } satisfies UserProfileEngagementSummary;
    },
  };
}

describe("user-profile-rendering", () => {
  it("renders user profile sections", () => {
    const reader = createReader();
    const rendered = render(reader, "u-1");

    expect(rendered).toContain("USER PROFILE: Ada");
    expect(rendered).toContain("Preferences");
    expect(rendered).toContain("Beliefs");
    expect(rendered).toContain("Bun-first default [cli]");
    expect(rendered).toContain("Engagement: touches=9 cadence=steady");
  });

  it("renders combined cards and agent profile", () => {
    const reader = createReader();
    const cards = renderCards(reader, "u-1");

    expect(cards).toContain("USER PROFILE: Ada");
    expect(cards).toContain("AGENT PROFILE: Doolittle");
    expect(cards).toContain("TypeScript refactor");
  });

  it("renders standalone agent summary", () => {
    const reader = createReader();
    const agentRendered = renderAgent(reader);

    expect(agentRendered).toContain("AGENT PROFILE: Doolittle");
    expect(agentRendered).toContain("Updated:");
    expect(agentRendered).toContain("Modeling stable");
  });

  it("builds workspace summary with expected aggregate counts", () => {
    const reader = createReader();
    const result = summary(reader);

    expect(result.totalProfiles).toBe(2);
    expect(result.totalBeliefs).toBe(2);
    expect(result.totalBeliefSources).toBe(2);
    expect(result.activeRelationships).toBe(1);
    expect(result.engagedProfiles).toBe(1);
    expect(result.relationshipStatusCounts.active).toBe(1);
    expect(result.topBeliefProfiles).toHaveLength(1);
    expect(result.topRelationships[0]?.userId).toBe("u-1");
    expect(result.topEngagements).toHaveLength(1);
    expect(result.recentSignals).toContain("ship");
  });
});

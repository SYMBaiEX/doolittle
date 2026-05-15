import { describe, expect, it } from "bun:test";
import { createRolodexPlugin } from "./index";

describe("createRolodexPlugin", () => {
  it("exposes search, beliefs, relationship, and engagement", async () => {
    const plugin = createRolodexPlugin({
      profiles: {
        card: (userId: string) => `card:${userId}`,
        remember: (input) => ({
          userId: input.userId,
          preferences: [],
          facts: [],
          beliefs: [],
          beliefSources: [],
          notes: [input.text],
          lastSource: input.source,
          lastSeenAt: "2026-03-24T00:00:00.000Z",
          updatedAt: "2026-03-24T00:00:00.000Z",
        }),
        recall: (_userId: string, _query: string) => [
          {
            kind: "belief",
            value: "bun",
            score: 0.9,
          },
        ],
        observeAgent: (input) => ({
          name: "Doolittle",
          notes: [input.text],
          goals: [],
          strengths: [],
          workStyle: [],
          lastSource: input.source,
          updatedAt: "2026-03-24T00:00:00.000Z",
        }),
        agentProfile: () => "agent:Doolittle",
        search: (_query: string, _limit = 10) => [
          {
            userId: "user-1",
            score: 0.9,
            matchedFields: ["beliefs"],
            preview: ["bun"],
          },
        ],
        beliefs: (userId: string) => ({
          userId,
          count: 1,
          sourceCount: 1,
          beliefs: ["bun"],
          sources: ["cli"],
        }),
        relationship: (userId: string) => ({
          userId,
          status: "active",
          trust: 6,
          collaboration: 7,
          noteCount: 0,
          notes: [],
        }),
        engagement: (userId: string) => ({
          userId,
          touches: 3,
          channelCount: 1,
          sourceCount: 1,
          sessionCount: 0,
          recentSignalCount: 1,
          channels: ["cli"],
          sources: ["cli"],
          sessionIds: [],
          recentSignals: ["hello"],
        }),
        summary: () => ({
          totalProfiles: 1,
          agentName: "Doolittle",
          recentProfiles: ["user-1"],
          totalBeliefs: 1,
          totalBeliefSources: 1,
          activeRelationships: 1,
          trustedRelationships: 0,
          engagedProfiles: 1,
          relationshipStatusCounts: {
            new: 0,
            growing: 0,
            active: 1,
            trusted: 0,
          },
          topBeliefProfiles: [],
          topRelationships: [],
          topEngagements: [],
          topChannels: [],
          topSignals: [],
          recentSignals: ["hello"],
        }),
      },
    });

    const serviceFactory = plugin.services?.[0];
    if (!serviceFactory) {
      throw new Error("rolodex service not registered");
    }

    const service = (await serviceFactory.start({} as never)) as unknown as {
      card(userId: string): unknown;
      search(query: string, limit?: number): unknown;
      beliefs(userId: string): unknown;
      relationship(userId: string): unknown;
      engagement(userId: string): unknown;
      summary(): unknown;
    };

    expect(service.card("user-1")).toBe("card:user-1");
    expect(service.search("bun", 5)).toEqual([
      {
        userId: "user-1",
        score: 0.9,
        matchedFields: ["beliefs"],
        preview: ["bun"],
      },
    ]);
    expect(service.beliefs("user-1")).toEqual({
      userId: "user-1",
      count: 1,
      sourceCount: 1,
      beliefs: ["bun"],
      sources: ["cli"],
    });
    expect(service.relationship("user-1")).toEqual({
      userId: "user-1",
      status: "active",
      trust: 6,
      collaboration: 7,
      noteCount: 0,
      notes: [],
    });
    expect(service.engagement("user-1")).toEqual({
      userId: "user-1",
      touches: 3,
      channelCount: 1,
      sourceCount: 1,
      sessionCount: 0,
      recentSignalCount: 1,
      channels: ["cli"],
      sources: ["cli"],
      sessionIds: [],
      recentSignals: ["hello"],
    });
    expect(service.summary()).toMatchObject({
      totalProfiles: 1,
      agentName: "Doolittle",
      recentProfiles: ["user-1"],
      totalBeliefs: 1,
      totalBeliefSources: 1,
      activeRelationships: 1,
      trustedRelationships: 0,
      engagedProfiles: 1,
      recentSignals: ["hello"],
    });
  });
});

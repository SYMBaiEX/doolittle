import { describe, expect, it } from "bun:test";
import { createEmptyProfile } from "./storage";
import {
  buildBeliefSummary,
  buildEngagementSummary,
  buildRelationshipSummary,
} from "./summaries";

describe("user-profile summary helpers", () => {
  it("builds belief, relationship, and engagement summaries from a profile", () => {
    const profile = createEmptyProfile("user-1");
    profile.displayName = "Alex";
    profile.beliefs = ["Likes Bun", "Prefers short updates"];
    profile.beliefSources = ["cli", "notes"];
    profile.relationship = {
      status: "active",
      trust: 4,
      collaboration: 3,
      notes: ["Met in review"],
      lastInteractionAt: "2026-04-01T00:00:00.000Z",
      lastSource: "cli",
    };
    profile.engagement = {
      touches: 7,
      channels: ["cli", "gateway"],
      sources: ["cli"],
      sessionIds: ["s1", "s2"],
      recentSignals: ["likes Bun"],
      lastInteractionAt: "2026-04-01T00:00:00.000Z",
      lastSource: "cli",
    };

    const reader = {
      get() {
        return profile;
      },
    };

    expect(buildBeliefSummary(reader, "user-1")).toEqual({
      userId: "user-1",
      displayName: "Alex",
      count: 2,
      sourceCount: 2,
      beliefs: ["Likes Bun", "Prefers short updates"],
      sources: ["cli", "notes"],
    });

    expect(buildRelationshipSummary(reader, "user-1")).toMatchObject({
      userId: "user-1",
      displayName: "Alex",
      status: "active",
      trust: 4,
      collaboration: 3,
      noteCount: 1,
      notes: ["Met in review"],
      lastSource: "cli",
    });

    expect(buildEngagementSummary(reader, "user-1")).toMatchObject({
      userId: "user-1",
      displayName: "Alex",
      touches: 7,
      channelCount: 2,
      sourceCount: 1,
      sessionCount: 2,
      recentSignalCount: 1,
      channels: ["cli", "gateway"],
      sources: ["cli"],
      sessionIds: ["s1", "s2"],
      recentSignals: ["likes Bun"],
      lastSource: "cli",
    });
  });
});

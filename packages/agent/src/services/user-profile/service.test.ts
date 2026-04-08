import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UserProfileService } from "./service";

describe("UserProfileService", () => {
  it("learns simple preferences and facts from observations", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-user-profile-"));
    const service = new UserProfileService(root);

    try {
      service.observe("user-1", "My name is Alex.", "cli");
      service.observe("user-1", "I prefer Bun for tooling.", "cli");
      service.addNote("user-1", "Important: likes concise updates.", "cli");

      const profile = service.get("user-1");
      expect(profile.displayName).toBe("Alex");
      expect(profile.preferences.some((entry) => entry.includes("Bun"))).toBe(
        true,
      );
      expect(profile.notes.some((entry) => entry.includes("concise"))).toBe(
        true,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("extracts aliases, goals, tools, and work style signals", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-user-profile-signals-"));
    const service = new UserProfileService(root);

    try {
      service.observe("user-2", "You can call me AJ.", "telegram");
      service.observe(
        "user-2",
        "I want to ship the Docker backend this week.",
        "telegram",
      );
      service.observe(
        "user-2",
        "I usually use Bun with Docker and Lightpanda.",
        "telegram",
      );
      service.observe(
        "user-2",
        "I work best with concise step-by-step updates.",
        "telegram",
      );

      const profile = service.get("user-2");
      expect(profile.aliases).toContain("AJ");
      expect(
        profile.goals?.some((entry) =>
          entry.includes("ship the Docker backend"),
        ),
      ).toBe(true);
      expect(profile.toolPreferences).toContain("Bun");
      expect(profile.toolPreferences).toContain("Docker");
      expect(profile.toolPreferences).toContain("Lightpanda");
      expect(
        profile.workStyle?.some((entry) =>
          entry.includes("concise step-by-step"),
        ),
      ).toBe(true);

      const rendered = service.render("user-2");
      expect(rendered).toContain("Goals");
      expect(rendered).toContain("Tools");
      expect(rendered).toContain("Work Style");
      expect(rendered).toContain("Aliases");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("tracks beliefs, relationship signals, and engagement summaries", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-user-profile-rel-"));
    const service = new UserProfileService(root);

    try {
      service.remember(
        "user-4",
        "belief",
        "Doolittle should stay Eliza-native.",
        "cli",
      );
      service.observe(
        "user-4",
        "I believe Bun is the right toolchain and I trust this setup.",
        "cli",
      );
      service.observe(
        "user-4",
        "We should collaborate more closely and you can count on me.",
        "cli",
      );

      const beliefs = service.beliefs("user-4");
      const relationship = service.relationship("user-4");
      const engagement = service.engagement("user-4");
      const rendered = service.render("user-4");

      expect(
        beliefs.beliefs.some((entry) => entry.includes("Eliza-native")),
      ).toBe(true);
      expect(beliefs.count).toBe(2);
      expect(beliefs.sourceCount).toBeGreaterThan(0);
      expect(
        beliefs.beliefs.some((entry) => entry.includes("Bun is the right")),
      ).toBe(true);
      expect(relationship.status).not.toBe("new");
      expect(relationship.trust).toBeGreaterThan(0);
      expect(relationship.collaboration).toBeGreaterThan(0);
      expect(relationship.noteCount).toBeGreaterThan(0);
      expect(engagement.touches).toBeGreaterThan(0);
      expect(engagement.channelCount).toBeGreaterThan(0);
      expect(engagement.sourceCount).toBeGreaterThan(0);
      expect(engagement.sessionCount).toBeGreaterThanOrEqual(0);
      expect(engagement.recentSignalCount).toBeGreaterThan(0);
      expect(engagement.channels).toContain("cli");
      expect(engagement.recentSignals.length).toBeGreaterThan(0);
      expect(rendered).toContain("Beliefs");
      expect(rendered).toContain("Relationship");
      expect(rendered).toContain("Engagement");

      const search = service.search("Eliza", 5);
      expect(search.some((entry) => entry.userId === "user-4")).toBe(true);

      const recall = service.recall("user-4", "Bun");
      expect(recall.some((entry) => entry.kind === "belief")).toBe(true);
      expect(recall.some((entry) => entry.kind === "relationship")).toBe(true);
      expect(recall.some((entry) => entry.kind === "engagement")).toBe(true);

      const summary = service.summary();
      expect(summary.totalBeliefs).toBeGreaterThanOrEqual(2);
      expect(summary.totalBeliefSources).toBeGreaterThan(0);
      expect(summary.trustedRelationships).toBeGreaterThanOrEqual(0);
      expect(summary.relationshipStatusCounts.active).toBeGreaterThanOrEqual(0);
      expect(summary.topBeliefProfiles.length).toBeGreaterThanOrEqual(1);
      expect(summary.topRelationships.length).toBeGreaterThanOrEqual(1);
      expect(summary.topEngagements.length).toBeGreaterThanOrEqual(1);
      expect(summary.topSignals.length).toBeGreaterThanOrEqual(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("supports explicit memories, mode switches, and agent profile cards", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-user-profile-cards-"));
    const service = new UserProfileService(root);

    try {
      service.remember(
        "user-3",
        "context",
        "We are shipping the gateway pass.",
      );
      service.remember(
        "user-3",
        "constraint",
        "Do not mention legacy branding.",
      );
      service.remember("user-3", "memory", "Use Bun as the default toolchain.");
      service.setMode("user-3", "local");
      service.observeAgent(
        "goal: keep Doolittle native and operator-friendly",
        "cli",
      );
      service.observeAgent(
        "strength: strong Bun and TypeScript execution flows",
        "cli",
      );

      const profile = service.get("user-3");
      const agent = service.getAgent();
      const card = service.renderCards("user-3");

      expect(profile.memoryMode).toBe("local");
      expect(profile.projectContext).toContain(
        "We are shipping the gateway pass.",
      );
      expect(profile.constraints).toContain("Do not mention legacy branding.");
      expect(profile.explicitMemories).toContain(
        "Use Bun as the default toolchain.",
      );
      expect(
        agent.goals.some((entry) => entry.includes("Doolittle native")),
      ).toBe(true);
      expect(
        agent.strengths.some((entry) => entry.includes("TypeScript execution")),
      ).toBe(true);
      expect(card).toContain("AGENT PROFILE");
      expect(card).toContain("Explicit Memories");
      expect(card).toContain("Project Context");

      const recall = service.recall("user-3", "Bun");
      expect(recall.length).toBeGreaterThan(0);
      expect(recall.some((entry) => entry.value.includes("Bun"))).toBe(true);

      const seeded = service.seedAgent({
        name: "Doolittle Prime",
        goals: ["Ship operator-grade automation"],
        strengths: ["Structured runtime orchestration"],
      });
      expect(seeded.name).toBe("Doolittle Prime");
      expect(seeded.goals).toContain("Ship operator-grade automation");
      expect(seeded.strengths).toContain("Structured runtime orchestration");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("supports synthesized profile context, conclusions, and split modeling controls", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-user-profile-context-"));
    const service = new UserProfileService(root);

    try {
      service.observe(
        "user-5",
        "I believe Bun should stay the default toolchain and I trust this setup.",
        "cli",
      );
      service.remember(
        "user-5",
        "context",
        "We are finalizing the Eliza-native monorepo.",
        "cli",
      );
      service.configureModeling("user-5", {
        userMemoryMode: "local",
        assistantMemoryMode: "hybrid",
        dialecticMode: "conclude",
      });

      const context = service.context(
        "user-5",
        "What matters most about this user's toolchain preferences?",
      );
      expect(context.answer).toContain("user memory");
      expect(context.evidence.length).toBeGreaterThan(0);
      expect(context.userMemoryMode).toBe("local");
      expect(context.assistantMemoryMode).toBe("hybrid");
      expect(context.dialecticMode).toBe("conclude");

      const conclusion = service.conclude(
        "user-5",
        "What matters most about this user's toolchain preferences?",
        "Preserve Bun-first defaults and keep changes Eliza-native.",
        "cli",
      );
      const profile = service.get("user-5");
      expect(conclusion.conclusion).toContain("Bun-first");
      expect(
        profile.explicitMemories?.some((entry) => entry.includes("Bun-first")),
      ).toBe(true);
      expect(
        profile.relationship?.notes.some((entry) =>
          entry.includes("Conclusion: Preserve Bun-first defaults"),
        ),
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

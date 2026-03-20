import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UserProfileService } from "./user-profile-service";

describe("UserProfileService", () => {
  it("learns simple preferences and facts from observations", () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-agent-user-profile-"));
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
    const root = mkdtempSync(
      join(tmpdir(), "eliza-agent-user-profile-signals-"),
    );
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

  it("supports explicit memories, mode switches, and agent profile cards", () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-agent-user-profile-cards-"));
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
        "goal: keep Eliza Agent native and operator-friendly",
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
        agent.goals.some((entry) => entry.includes("Eliza Agent native")),
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
        name: "Eliza Agent Prime",
        goals: ["Ship operator-grade automation"],
        strengths: ["Structured runtime orchestration"],
      });
      expect(seeded.name).toBe("Eliza Agent Prime");
      expect(seeded.goals).toContain("Ship operator-grade automation");
      expect(seeded.strengths).toContain("Structured runtime orchestration");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

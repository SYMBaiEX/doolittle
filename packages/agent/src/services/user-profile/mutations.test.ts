import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUserProfileMutations } from "./mutations";
import { createUserProfileStorage } from "./storage";

describe("user-profile mutation helpers", () => {
  it("applies memory, observation, and relationship mutations", () => {
    const root = mkdtempSync(
      join(tmpdir(), "doolittle-user-profile-mutations-"),
    );
    const storage = createUserProfileStorage(join(root, "profiles.json"));
    const mutations = createUserProfileMutations(storage);

    try {
      mutations.remember(
        "user-1",
        "belief",
        "Bun should stay the default.",
        "cli",
      );
      mutations.remember(
        "user-1",
        "relationship",
        "Trust this workflow.",
        "cli",
      );
      mutations.observe(
        "user-1",
        "I prefer Bun and I trust this setup.",
        "cli",
      );

      const profile = storage
        .read()
        .profiles.find((entry) => entry.userId === "user-1");
      expect(profile).toBeDefined();
      expect(profile?.beliefs).toContain("Bun should stay the default.");
      expect(profile?.beliefSources).toContain("cli");
      expect(
        profile?.relationship?.notes.some((entry) =>
          entry.includes("Trust this workflow"),
        ),
      ).toBe(true);
      expect(profile?.preferences.some((entry) => entry.includes("Bun"))).toBe(
        true,
      );
      expect(profile?.relationship?.trust).toBeGreaterThan(0);
      expect(profile?.lastSource).toBe("cli");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("seeds the agent profile and records conclusions", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-user-profile-agent-"));
    const storage = createUserProfileStorage(join(root, "profiles.json"));
    const mutations = createUserProfileMutations(storage);

    try {
      const agent = mutations.seedAgent({
        name: "Doolittle Prime",
        goals: ["Ship operator-grade automation"],
        strengths: ["Structured runtime orchestration"],
      });

      const conclusion = mutations.conclude(
        "user-2",
        "What matters most?",
        "Preserve Bun-first defaults and keep changes Eliza-native.",
        "cli",
      );
      const profile = storage
        .read()
        .profiles.find((entry) => entry.userId === "user-2");

      expect(agent.name).toBe("Doolittle Prime");
      expect(agent.goals).toContain("Ship operator-grade automation");
      expect(agent.strengths).toContain("Structured runtime orchestration");
      expect(conclusion.conclusion).toContain("Bun-first");
      expect(
        profile?.notes.some((entry) =>
          entry.includes("Conclusion: Preserve Bun-first defaults"),
        ),
      ).toBe(true);
      expect(
        profile?.explicitMemories?.some((entry) =>
          entry.includes("What matters most? => Preserve Bun-first defaults"),
        ),
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

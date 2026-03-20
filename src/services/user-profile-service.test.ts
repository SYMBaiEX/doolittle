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
});

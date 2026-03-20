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
      expect(profile.preferences.some((entry) => entry.includes("Bun"))).toBe(true);
      expect(profile.notes.some((entry) => entry.includes("concise"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

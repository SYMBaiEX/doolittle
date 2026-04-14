import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createEmptyProfile,
  createUserProfileStorage,
  normalizeRelationship,
} from "./storage";

describe("user-profile storage", () => {
  it("hydrates persisted profiles and agent records with defaults", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-user-profile-storage-"));
    const filePath = join(root, "profiles.json");

    try {
      writeFileSync(
        filePath,
        JSON.stringify({
          profiles: [
            {
              userId: "user-1",
              preferences: ["Bun"],
              relationship: { trust: 4 },
            },
          ],
          agent: { name: "Operator" },
        }),
        "utf8",
      );

      const storage = createUserProfileStorage(filePath);
      const store = storage.read();

      expect(store.profiles).toHaveLength(1);
      expect(store.profiles[0]?.userMemoryMode).toBe("hybrid");
      expect(store.profiles[0]?.assistantMemoryMode).toBe("hybrid");
      expect(store.profiles[0]?.relationship?.status).toBe("active");
      expect(store.profiles[0]?.engagement?.channels).toEqual([]);
      expect(store.agent.name).toBe("Operator");
      expect(store.agent.goals).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("records interaction state and preserves defensive copies during updates", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-user-profile-update-"));
    const filePath = join(root, "profiles.json");
    const storage = createUserProfileStorage(filePath);

    try {
      storage.update(
        "user-2",
        (profile) => {
          profile.preferences.push("Bun");
          profile.relationship = normalizeRelationship({
            trust: 3,
            collaboration: 2,
            notes: ["helped ship the runtime split"],
          });
        },
        {
          source: "cli",
          channel: "terminal",
          sessionId: "session-1",
          signal: "ship it",
        },
      );

      const store = storage.read();
      const profile = store.profiles[0];
      expect(profile?.preferences).toContain("Bun");
      expect(profile?.engagement?.touches).toBe(1);
      expect(profile?.engagement?.channels).toEqual(["terminal"]);
      expect(profile?.engagement?.sources).toEqual(["cli"]);
      expect(profile?.engagement?.sessionIds).toEqual(["session-1"]);
      expect(profile?.engagement?.recentSignals).toEqual(["ship it"]);
      expect(profile?.relationship?.status).toBe("growing");
      expect(profile?.lastSource).toBe("cli");

      const external = createEmptyProfile("user-2");
      external.preferences.push("leaked");
      expect(store.profiles[0]?.preferences).not.toContain("leaked");

      const persisted = JSON.parse(readFileSync(filePath, "utf8")) as {
        profiles: Array<{ engagement?: { touches?: number } }>;
      };
      expect(persisted.profiles[0]?.engagement?.touches).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("updates agent records without dropping seeded arrays", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-user-profile-agent-"));
    const filePath = join(root, "profiles.json");
    const storage = createUserProfileStorage(filePath);

    try {
      storage.updateAgent((agent) => {
        agent.goals.push("ship");
        agent.strengths.push("bun");
      });

      const second = storage.updateAgent((agent) => {
        agent.notes.push("steady");
      });

      expect(second.goals).toEqual(["ship"]);
      expect(second.strengths).toEqual(["bun"]);
      expect(second.notes).toEqual(["steady"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

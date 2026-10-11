import { spawnSync } from "node:child_process";
import {
  chmodSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { UserProfileService } from "./service";
import {
  createEmptyProfile,
  createUserProfileStorage,
  normalizeRelationship,
} from "./storage";

describe("user-profile storage", () => {
  it("reopens its dedicated directory without losing data", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-profile-restart-"));
    try {
      const first = new UserProfileService(root);
      first.setExplicitMemories("alice", ["Keep it brief"], "test");
      chmodSync(join(root, "profiles"), 0o755);
      const second = new UserProfileService(root);
      expect(second.get("alice").explicitMemories).toEqual(["Keep it brief"]);
      expect(statSync(join(root, "profiles")).mode & 0o777).toBe(0o700);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("migrates a valid legacy root profile once", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-profile-legacy-"));
    const legacy = join(root, "user-profiles.json");
    try {
      writeFileSync(
        legacy,
        JSON.stringify({
          profiles: [{ userId: "alice", explicitMemories: ["legacy"] }],
          agent: {},
        }),
      );
      const service = new UserProfileService(root);
      expect(service.get("alice").explicitMemories).toEqual(["legacy"]);
      expect(() => readFileSync(legacy)).toThrow();
      expect(
        new UserProfileService(root).get("alice").explicitMemories,
      ).toEqual(["legacy"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
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

  it("does not expose cached state through read, write, or mutation returns", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-profile-cache-"));
    const path = join(root, "profiles.json");
    const storage = createUserProfileStorage(path);
    try {
      const returnedProfile = storage.update("alice", (profile) => {
        profile.preferences.push("saved");
      });
      returnedProfile.preferences.push("return-only");
      const returnedAgent = storage.updateAgent((agent) => {
        agent.goals.push("saved");
      });
      returnedAgent.goals.push("return-only");
      const read = storage.read();
      read.profiles[0]?.preferences.push("read-only");
      read.agent.goals.push("read-only");
      expect(storage.read().profiles[0]?.preferences).toEqual(["saved"]);
      expect(storage.read().agent.goals).toEqual(["saved"]);
      const external = storage.read();
      storage.write(external);
      external.agent.goals.push("write-input-only");
      expect(storage.read().agent.goals).toEqual(["saved"]);
      const reopened = createUserProfileStorage(path);
      expect(reopened.read().profiles[0]?.preferences).toEqual(["saved"]);
      expect(reopened.read().agent.goals).toEqual(["saved"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects unsafe persisted profiles without replacing them", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-profile-invalid-"));
    const path = join(root, "profiles.json");
    const outside = join(root, "outside.json");
    try {
      writeFileSync(outside, JSON.stringify({ profiles: [], agent: {} }));
      symlinkSync(outside, path);
      expect(() => createUserProfileStorage(path).read()).toThrow();
      expect(readFileSync(outside, "utf8")).toContain("profiles");
      rmSync(path);
      writeFileSync(path, JSON.stringify({ profiles: "bad" }));
      expect(() => createUserProfileStorage(path).read()).toThrow();
      expect(readFileSync(path, "utf8")).toContain("bad");
      rmSync(path);
      writeFileSync(path, "x".repeat(4 * 1024 * 1024 + 1));
      expect(() => createUserProfileStorage(path).read()).toThrow();
      rmSync(path);
      writeFileSync(path, JSON.stringify({ profiles: [], agent: {} }));
      linkSync(path, join(root, "hardlink.json"));
      expect(() => createUserProfileStorage(path).read()).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps cached state unchanged when an update cannot persist", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-profile-write-"));
    const path = join(root, "profiles.json");
    const storage = createUserProfileStorage(path);
    try {
      storage.read();
      rmSync(path);
      mkdirSync(path);
      expect(() =>
        storage.update("alice", (profile) => {
          profile.preferences.push("uncommitted");
        }),
      ).toThrow();
      expect(storage.read().profiles).toEqual([]);
      expect(() =>
        storage.updateAgent((agent) => {
          agent.goals.push("uncommitted");
        }),
      ).toThrow();
      expect(storage.read().agent.goals).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects oversized updates before they poison persisted state", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-profile-large-"));
    const storage = createUserProfileStorage(join(root, "profiles.json"));
    try {
      storage.read();
      expect(() =>
        storage.update("alice", (profile) => {
          profile.preferences.push("x".repeat(4 * 1024 * 1024));
        }),
      ).toThrow("byte limit");
      expect(storage.read().profiles).toEqual([]);
      expect(
        createUserProfileStorage(join(root, "profiles.json")).read().profiles,
      ).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === "win32")(
    "rejects a profile FIFO without blocking",
    () => {
      const root = mkdtempSync(join(tmpdir(), "doolittle-profile-fifo-"));
      const path = join(root, "profiles.json");
      try {
        const result = spawnSync("mkfifo", [path]);
        if (result.error || result.status !== 0)
          throw new Error("mkfifo unavailable");
        expect(() => createUserProfileStorage(path).read()).toThrow();
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
});

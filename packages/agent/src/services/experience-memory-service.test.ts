import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ExperienceMemoryService } from "./experience-memory-service";
import { UserProfileService } from "./user-profile/service";

const roots: string[] = [];

function createService(): {
  root: string;
  profiles: UserProfileService;
  memory: ExperienceMemoryService;
} {
  const root = mkdtempSync(join(tmpdir(), "doolittle-experience-memory-"));
  roots.push(root);
  const profiles = new UserProfileService(join(root, "profiles"));
  return {
    root,
    profiles,
    memory: new ExperienceMemoryService(
      root,
      { memory: 10_000, user: 10_000 },
      profiles,
    ),
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("ExperienceMemoryService", () => {
  it("keeps shared memory in MEMORY.md and user memory in rolodex profiles", () => {
    const { root, profiles, memory } = createService();

    memory.add("memory", "Shared operating rule");
    memory.add("user", "Prefers concise updates", "alice");
    memory.add("user", "Prefers detailed updates", "bob");

    expect(memory.list("memory")).toEqual(["Shared operating rule"]);
    expect(memory.list("user", "alice")).toEqual(["Prefers concise updates"]);
    expect(memory.list("user", "bob")).toEqual(["Prefers detailed updates"]);
    expect(profiles.get("alice").explicitMemories).toEqual([
      "Prefers concise updates",
    ]);
    expect(readFileSync(join(root, "memories", "MEMORY.md"), "utf8")).toBe(
      "Shared operating rule",
    );
    expect(existsSync(join(root, "memories", "USER.md"))).toBe(false);
  });

  it("preserves replace and remove compatibility over explicit profile memory", () => {
    const { profiles, memory } = createService();
    memory.add("user", "Uses Nub for package scripts", "alice");
    memory.add("user", "Keeps changes focused", "alice");

    expect(
      memory.replace(
        "user",
        "Nub",
        "Uses Nub for all package scripts",
        "alice",
      ),
    ).toBe("Memory entry replaced.");
    expect(memory.remove("user", "focused", "alice")).toBe(
      "Memory entry removed.",
    );
    expect(profiles.get("alice").explicitMemories).toEqual([
      "Uses Nub for all package scripts",
    ]);
  });

  it("migrates legacy USER.md into the local rolodex once and keeps a backup", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-experience-memory-"));
    roots.push(root);
    const memoryDir = join(root, "memories");
    mkdirSync(memoryDir, { recursive: true });
    const profiles = new UserProfileService(join(root, "profiles"));
    writeFileSync(
      join(memoryDir, "USER.md"),
      [
        "User fact: Builds desktop agents",
        "User preference: Keep it direct",
        "Keep release notes operator-readable",
      ].join("\n§\n"),
      "utf8",
    );

    const memory = new ExperienceMemoryService(
      root,
      { memory: 10_000, user: 10_000 },
      profiles,
    );

    expect(memory.list("user", "desktop-user")).toEqual([
      "Keep release notes operator-readable",
    ]);
    expect(profiles.get("desktop-user")).toMatchObject({
      facts: ["Builds desktop agents"],
      preferences: ["Keep it direct"],
    });
    expect(existsSync(join(memoryDir, "USER.md"))).toBe(false);
    expect(existsSync(join(memoryDir, "USER.md.migrated"))).toBe(true);

    const restarted = new ExperienceMemoryService(
      root,
      { memory: 10_000, user: 10_000 },
      profiles,
    );
    expect(restarted.list("user", "desktop-user")).toEqual([
      "Keep release notes operator-readable",
    ]);
    expect(profiles.get("desktop-user").facts).toHaveLength(1);
    expect(profiles.get("desktop-user").preferences).toHaveLength(1);
  });
});

import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUserProfileMutations } from "./mutations";
import { createSeedAgentMutation } from "./mutations/agent";
import { createConcludeMutation } from "./mutations/conclusion";
import { defaultMutationHost } from "./mutations/host";
import { createAddNoteMutation } from "./mutations/note";
import { appendRelationshipNote } from "./mutations/relationship";
import { createRememberMutation } from "./mutations/remember";
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

  it("applies modeling controls and agent observation mutations", () => {
    const root = mkdtempSync(
      join(tmpdir(), "doolittle-user-profile-modeling-"),
    );
    const storage = createUserProfileStorage(join(root, "profiles.json"));
    const mutations = createUserProfileMutations(storage);

    try {
      mutations.setMode("user-3", "local");
      mutations.configureModeling("user-3", {
        assistantMemoryMode: "hybrid",
        dialecticMode: "assist",
      });
      mutations.addNote("user-3", " Keep the gateway pass small. ", "cli");
      mutations.observeAgent(
        "goal: keep Doolittle native and operator-friendly",
        "cli",
      );
      mutations.observeAgent(
        "strength: strong Bun and TypeScript execution flows",
        "cli",
      );

      const profile = storage
        .read()
        .profiles.find((entry) => entry.userId === "user-3");
      const agent = storage.read().agent;

      expect(profile?.memoryMode).toBe("local");
      expect(profile?.userMemoryMode).toBe("local");
      expect(profile?.assistantMemoryMode).toBe("hybrid");
      expect(profile?.dialecticMode).toBe("assist");
      expect(profile?.notes).toContain("Keep the gateway pass small.");
      expect(
        agent.goals.some((entry) => entry.includes("Doolittle native")),
      ).toBe(true);
      expect(
        agent.strengths.some((entry) => entry.includes("TypeScript execution")),
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("mutation seams (individual creators)", () => {
  function makeStorage() {
    const root = mkdtempSync(join(tmpdir(), "doolittle-mutation-seams-"));
    return {
      storage: createUserProfileStorage(join(root, "profiles.json")),
      cleanup: () => rmSync(root, { recursive: true, force: true }),
    };
  }

  it("defaultMutationHost.nowIso returns a valid ISO timestamp", () => {
    const ts = defaultMutationHost.nowIso();
    expect(new Date(ts).toISOString()).toBe(ts);
  });

  it("defaultMutationHost.unique deduplicates and trims", () => {
    const result = defaultMutationHost.unique([" a", "b", "a ", "b", "c"]);
    expect(result).toEqual(["a", "b", "c"]);
  });

  it("createAddNoteMutation delegates to remember with kind=note", () => {
    const { storage, cleanup } = makeStorage();
    try {
      const remember = createRememberMutation(storage, defaultMutationHost);
      const addNote = createAddNoteMutation(remember);
      addNote("u1", " shipped via note. ", "cli");
      const profile = storage.read().profiles.find((p) => p.userId === "u1");
      expect(profile?.notes).toContain("shipped via note.");
      expect(profile?.lastSource).toBe("cli");
    } finally {
      cleanup();
    }
  });

  it("createRememberMutation handles every RememberKind branch", () => {
    const { storage, cleanup } = makeStorage();
    try {
      const remember = createRememberMutation(storage, defaultMutationHost);
      remember("u2", "preference", "dark mode", "cli");
      remember("u2", "fact", "TypeScript 5.x", "cli");
      remember("u2", "belief", "fewer deps is better", "cli");
      remember("u2", "goal", "ship daily", "cli");
      remember("u2", "context", "monorepo project", "cli");
      remember("u2", "constraint", "no external db", "cli");
      remember("u2", "relationship", "good collaborator", "cli");
      remember("u2", "memory", "decided on Bun", "cli");
      remember("u2", "note", "keep it simple", "cli");

      const profile = storage.read().profiles.find((p) => p.userId === "u2");

      expect(profile?.preferences).toContain("dark mode");
      expect(profile?.facts).toContain("TypeScript 5.x");
      expect(profile?.beliefs).toContain("fewer deps is better");
      expect(profile?.goals).toContain("ship daily");
      expect(profile?.projectContext).toContain("monorepo project");
      expect(profile?.constraints).toContain("no external db");
      expect(
        profile?.relationship?.notes.some((n) =>
          n.includes("good collaborator"),
        ),
      ).toBe(true);
      expect(profile?.explicitMemories).toContain("decided on Bun");
      expect(profile?.notes).toContain("keep it simple");
    } finally {
      cleanup();
    }
  });

  it("appendRelationshipNote builds and normalises relationship data", () => {
    const note = appendRelationshipNote(
      defaultMutationHost,
      undefined,
      "First contact",
      "cli",
    );
    expect(note.notes).toContain("First contact");
    expect(note.lastSource).toBe("cli");
    expect(typeof note.trust).toBe("number");
    expect(typeof note.collaboration).toBe("number");
    expect(typeof note.lastInteractionAt).toBe("string");
  });

  it("appendRelationshipNote caps notes at the given limit", () => {
    let rel = appendRelationshipNote(
      defaultMutationHost,
      undefined,
      "note-1",
      "cli",
    );
    for (let i = 2; i <= 5; i++) {
      rel = appendRelationshipNote(
        defaultMutationHost,
        rel,
        `note-${i}`,
        "cli",
      );
    }
    // limit of 3 keeps only the last 3
    const capped = appendRelationshipNote(
      defaultMutationHost,
      rel,
      "note-6",
      "cli",
      3,
    );
    expect(capped.notes).toHaveLength(3);
    expect(capped.notes[capped.notes.length - 1]).toBe("note-6");
  });

  it("createConcludeMutation records conclusion in notes, memories, and relationship", () => {
    const { storage, cleanup } = makeStorage();
    try {
      const conclude = createConcludeMutation(storage, defaultMutationHost);
      const result = conclude("u3", "Why Bun?", "Fast and native", "cli");

      expect(result.userId).toBe("u3");
      expect(result.query).toBe("Why Bun?");
      expect(result.conclusion).toBe("Fast and native");
      expect(result.source).toBe("cli");
      expect(typeof result.recordedAt).toBe("string");

      const profile = storage.read().profiles.find((p) => p.userId === "u3");
      expect(
        profile?.notes.some((n) => n.includes("Conclusion: Fast and native")),
      ).toBe(true);
      expect(
        profile?.explicitMemories?.some((m) =>
          m.includes("Why Bun? => Fast and native"),
        ),
      ).toBe(true);
      expect(
        profile?.relationship?.notes.some((n) =>
          n.includes("Conclusion: Fast and native"),
        ),
      ).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("createSeedAgentMutation merges and deduplicates agent fields", () => {
    const { storage, cleanup } = makeStorage();
    try {
      const seedAgent = createSeedAgentMutation(storage, defaultMutationHost);
      seedAgent({ name: "Alpha", goals: ["goal-a"], strengths: ["str-a"] });
      const agent = seedAgent({
        name: "  Alpha  ",
        goals: ["goal-a", "goal-b"],
        strengths: ["str-b"],
        workStyle: ["async"],
        notes: ["keep concise"],
      });

      expect(agent.name).toBe("Alpha");
      expect(agent.goals).toEqual(["goal-a", "goal-b"]);
      expect(agent.strengths).toEqual(["str-a", "str-b"]);
      expect(agent.workStyle).toContain("async");
      expect(agent.notes).toContain("keep concise");
    } finally {
      cleanup();
    }
  });
});

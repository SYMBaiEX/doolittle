import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { BackendManager } from "./backend";
import { BotCatalog } from "./bot-catalog";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function catalog() {
  const directory = mkdtempSync(resolve(tmpdir(), "doolittle-bot-catalog-"));
  directories.push(directory);
  const backend = {
    getState: () => ({
      phase: "ready",
      agentId: "9f21e797-127f-0eba-b547-92f9b113fb1e",
      name: "Doolittle",
    }),
    getWorkspaceDirectory: () => directory,
  } as unknown as BackendManager;
  return {
    directory,
    backend,
    value: new BotCatalog(directory, backend, directory),
  };
}

describe("persistent bot catalog", () => {
  it("round-trips a large valid sheet with a 16k persona projection", () => {
    const { directory, backend, value } = catalog();
    const system = "S".repeat(16_000);
    const character = {
      system,
      style: {
        all: ["A".repeat(2_000), "B".repeat(2_000), "C".repeat(2_000)],
      },
    };
    const created = value.create({ name: "Large", character });
    expect(created.persona).toBe(system);
    const reloaded = new BotCatalog(directory, backend, directory).get(
      created.id,
    );
    expect(reloaded?.character).toEqual(character);
    expect(reloaded?.agentId).toBe(created.agentId);
  });

  it("round-trips a rich sheet and preserves its fields across persona-only edits", () => {
    const { directory, backend, value } = catalog();
    const created = value.create({
      name: "Research",
      character: {
        system: "Investigate carefully",
        bio: ["Archivist"],
        style: { chat: ["Cite evidence"] },
        topics: ["history"],
        adjectives: ["curious"],
        postExamples: ["A concise finding"],
        messageExamples: [
          { examples: [{ name: "User", content: { text: "Hello" } }] },
        ],
      },
    });
    expect(created.persona).toBe("Investigate carefully");
    const reloaded = new BotCatalog(directory, backend, directory);
    expect(reloaded.get(created.id)?.character).toEqual(created.character);
    const edited = reloaded.update(created.id, {
      persona: "Explore carefully",
    });
    expect(edited.character?.system).toBe("Explore carefully");
    expect(edited.character?.bio).toEqual(["Archivist"]);
    const replaced = reloaded.update(created.id, {
      character: { system: "New sheet" },
    });
    expect(replaced.persona).toBe("New sheet");
    expect(replaced.character?.bio).toBeUndefined();
    expect(replaced.agentId).toBe(created.agentId);
  });

  it("hydrates legacy persona records without a read-triggered migration", () => {
    const { directory, backend, value } = catalog();
    const created = value.create({ name: "Legacy", persona: "Original" });
    const path = resolve(directory, "bots", "catalog.json");
    const stored = JSON.parse(readFileSync(path, "utf8"));
    delete stored.bots[0].character;
    writeFileSync(path, JSON.stringify(stored));
    const before = readFileSync(path, "utf8");
    const reloaded = new BotCatalog(directory, backend, directory);
    expect(reloaded.get(created.id)?.character?.system).toBe("Original");
    expect(reloaded.get(created.id)?.agentId).toBe(created.agentId);
    expect(readFileSync(path, "utf8")).toBe(before);
    reloaded.update(created.id, { name: "Renamed" });
    expect(
      JSON.parse(readFileSync(path, "utf8")).bots[0].character.system,
    ).toBe("Original");
  });

  it("rejects conflicting mixed input before changing the catalog", () => {
    const { directory, value } = catalog();
    expect(() =>
      value.create({ name: "Bad", persona: "A", character: { system: "B" } }),
    ).toThrow(/conflicts/i);
    const created = value.create({ name: "Good", persona: "A" });
    expect(() =>
      value.update(created.id, { persona: "A", character: { system: "B" } }),
    ).toThrow(/conflicts/i);
    expect(value.get(created.id)?.persona).toBe("A");
    expect(
      JSON.parse(
        readFileSync(resolve(directory, "bots", "catalog.json"), "utf8"),
      ).bots,
    ).toHaveLength(1);
  });

  it("keeps the lead bot's SDK identity and persists multiline personas without credentials", () => {
    const { directory, backend, value } = catalog();
    const created = value.create({
      name: "Research",
      persona: "First paragraph.\n\nSecond paragraph.\tDetail.",
      model: { provider: "offline", model: "offline" },
    });
    const listed = value.list(new Map());
    expect(listed.defaultBotId).toBe("9f21e797-127f-0eba-b547-92f9b113fb1e");
    expect(value.get("default")?.id).toBe(listed.defaultBotId);
    expect(value.get(listed.defaultBotId)?.isDefault).toBe(true);
    expect(created.id).not.toBe(listed.defaultBotId);
    expect(
      new BotCatalog(directory, backend, directory).get(created.id)?.persona,
    ).toContain("\n\n");
    expect(
      readFileSync(resolve(directory, "bots", "catalog.json"), "utf8"),
    ).not.toContain("API_KEY");
  });

  it("rejects a persisted record with invalid domain fields before exposing it", () => {
    const { directory, backend, value } = catalog();
    value.create({
      name: "Research",
      persona: "Safe",
      model: { provider: "offline", model: "offline" },
    });
    const path = resolve(directory, "bots", "catalog.json");
    const stored = JSON.parse(readFileSync(path, "utf8"));
    stored.bots[0].permissions.workspacePaths = ["/unapproved"];
    writeFileSync(path, JSON.stringify(stored));
    expect(() => new BotCatalog(directory, backend, directory)).toThrow(
      /catalog is invalid/i,
    );
  });
});

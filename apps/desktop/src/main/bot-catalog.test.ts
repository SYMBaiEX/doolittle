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

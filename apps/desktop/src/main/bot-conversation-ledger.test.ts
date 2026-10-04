import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BotConversationLedger } from "./bot-conversation-ledger";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const directory = mkdtempSync(
    resolve(tmpdir(), "doolittle-conversation-ledger-"),
  );
  directories.push(directory);
  return { directory, ledger: new BotConversationLedger(directory) };
}

describe("persistent bot conversation ownership", () => {
  it("keeps same bot/project binding idempotent across restarts and rejects reassignment", () => {
    const { directory, ledger } = fixture();
    const bound = ledger.bind("bot-one", "session-1", "project-one");
    expect(ledger.bind("bot-one", "session-1", "project-one")).toEqual(bound);
    expect(() => ledger.bind("bot-two", "session-1", "project-one")).toThrow(
      /different bot or project/i,
    );
    expect(() => ledger.bind("bot-one", "session-1", "project-two")).toThrow(
      /different bot or project/i,
    );
    expect(new BotConversationLedger(directory).get("session-1")).toEqual(
      bound,
    );
  });

  it("recovers from a corrupted primary without losing the bot owner", () => {
    const { directory, ledger } = fixture();
    ledger.bind("bot-one", "session-1");
    const primary = resolve(directory, "bots", "conversation-owners.json");
    writeFileSync(primary, "{broken");
    expect(new BotConversationLedger(directory).get("session-1")?.botId).toBe(
      "bot-one",
    );
    expect(
      JSON.parse(readFileSync(primary, "utf8")).conversations,
    ).toHaveLength(1);
  });

  it("fails closed when both ownership copies are corrupted", () => {
    const { directory, ledger } = fixture();
    ledger.bind("bot-one", "session-1");
    writeFileSync(
      resolve(directory, "bots", "conversation-owners.json"),
      "{broken",
    );
    writeFileSync(
      resolve(directory, "bots", "conversation-owners.backup.json"),
      "{broken",
    );
    expect(() => new BotConversationLedger(directory)).toThrow(
      /could not be recovered/i,
    );
  });

  it("keeps project and Computer resource IDs globally bound", () => {
    const { directory, ledger } = fixture();
    ledger.bindProject("bot-one", "project-1");
    ledger.bindResource("bot-one", "project-1", "resource-1");
    expect(() => ledger.bindProject("bot-two", "project-1")).toThrow(
      /different bot/i,
    );
    ledger.bindProject("bot-two", "project-2");
    expect(() =>
      ledger.bindResource("bot-two", "project-2", "resource-1"),
    ).toThrow(/different bot or project/i);
    expect(
      new BotConversationLedger(directory).getResource("resource-1"),
    ).toMatchObject({
      botId: "bot-one",
      projectId: "project-1",
    });
  });
});

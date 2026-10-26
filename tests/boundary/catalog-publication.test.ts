import { mkdirSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import { BotCatalog } from "../../apps/desktop/src/main/bot-catalog";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
function fixture() {
  const dir = mkdtempSync(resolve(tmpdir(), "doolittle-catalog-publication-"));
  dirs.push(dir);
  const backend = {
    getState: () => ({
      phase: "ready",
      agentId: "00000000-0000-4000-8000-000000000001",
      name: "Lead",
    }),
    getWorkspaceDirectory: () => dir,
  } as ConstructorParameters<typeof BotCatalog>[1];
  const catalog = new BotCatalog(dir, backend, dir);
  catalog.defaultBot();
  const saved = catalog.create({
    name: "Saved",
    persona: "Help",
    model: { provider: "offline", model: "offline" },
  });
  const path = resolve(dir, "bots/catalog.json");
  renameSync(path, `${path}.saved`);
  mkdirSync(path);
  return { catalog, saved };
}
it("does not publish a bot whose creation could not be saved", () => {
  const { catalog } = fixture();
  expect(() =>
    catalog.create({
      name: "Phantom",
      persona: "Help",
      model: { provider: "offline", model: "offline" },
    }),
  ).toThrow();
  expect(catalog.list(new Map()).bots.map((bot) => bot.name)).not.toContain(
    "Phantom",
  );
});
it("keeps the previous settings after a failed update", () => {
  const { catalog, saved } = fixture();
  expect(() => catalog.update(saved.id, { name: "Unsaved" })).toThrow();
  expect(catalog.get(saved.id)?.name).toBe("Saved");
});
it("keeps the bot available after a failed archive", () => {
  const { catalog, saved } = fixture();
  expect(() => catalog.archive(saved.id)).toThrow();
  expect(catalog.get(saved.id)?.archivedAt).toBeUndefined();
});
it("keeps the lead display name after a failed rename", () => {
  const { catalog } = fixture();
  expect(() => catalog.update("default", { name: "Unsaved lead" })).toThrow();
  expect(catalog.defaultBot().name).toBe("Lead");
});

it("refuses a pretty-printed ACP update before replacing the last readable ledger", async () => {
  const { BotAcpSessionLedger } = await import(
    "../../apps/desktop/src/main/bot-acp-session-ledger"
  );
  const { readFileSync, writeFileSync } = await import("node:fs");
  const dir = mkdtempSync(resolve(tmpdir(), "doolittle-ledger-budget-"));
  dirs.push(dir);
  mkdirSync(resolve(dir, "bots"));
  const createdAt = new Date().toISOString();
  const old = {
    sessionId: "old",
    botId: "bot",
    originConversationId: "origin",
    workspacePath: "/",
    createdAt,
  };
  const added = {
    sessionId: "new",
    botId: "bot",
    originConversationId: "origin",
    workspacePath: "/project",
    createdAt,
  };
  const seed = { version: 1, revision: 0, sessions: [old] };
  const next = { version: 1, revision: 1, sessions: [old, added] };
  old.workspacePath += "x".repeat(
    2_000_000 - Buffer.byteLength(JSON.stringify(next)) - 1,
  );
  const before = `${JSON.stringify(seed, null, 2)}\n`;
  expect(Buffer.byteLength(before)).toBeLessThanOrEqual(2_000_000);
  expect(Buffer.byteLength(JSON.stringify(next))).toBeLessThanOrEqual(
    2_000_000,
  );
  expect(Buffer.byteLength(JSON.stringify(next, null, 2)) + 1).toBeGreaterThan(
    2_000_000,
  );
  const path = resolve(dir, "bots", "acp-session-owners.json");
  writeFileSync(path, before);
  const ledger = new BotAcpSessionLedger(dir);
  expect(() =>
    ledger.bind({
      sessionId: "new",
      botId: "bot",
      originConversationId: "origin",
      workspacePath: "/project",
    }),
  ).toThrow(/full/);
  expect(readFileSync(path, "utf8")).toBe(before);
  expect(new BotAcpSessionLedger(dir).get("new")).toBeNull();
});

for (const copy of ["primary", "backup"]) {
  it(`recovers a full compact legacy conversation ${copy} without an oversized repair`, async () => {
    const { BotConversationLedger } = await import(
      "../../apps/desktop/src/main/bot-conversation-ledger"
    );
    const { existsSync, readFileSync, writeFileSync } = await import("node:fs");
    const dir = mkdtempSync(resolve(tmpdir(), "doolittle-legacy-recovery-"));
    dirs.push(dir);
    mkdirSync(resolve(dir, "bots"));
    const stamp = "2026-10-25T00:00:00.000Z";
    const conversations = Array.from({ length: 25_000 }, (_, index) => ({
      sessionId: `session-${index}`,
      botId: "bot",
      createdAt: stamp,
      updatedAt: stamp,
    }));
    const legacy = { version: 1, conversations };
    const raw = JSON.stringify(legacy);
    expect(Buffer.byteLength(raw)).toBeLessThanOrEqual(4_000_000);
    expect(Buffer.byteLength(JSON.stringify(legacy, null, 2))).toBeGreaterThan(
      4_000_000,
    );
    const primary = resolve(dir, "bots/conversation-owners.json");
    const backup = resolve(dir, "bots/conversation-owners.backup.json");
    const source = copy === "primary" ? primary : backup;
    const missing = copy === "primary" ? backup : primary;
    writeFileSync(source, raw);
    const ledger = new BotConversationLedger(dir);
    expect(ledger.get("session-0")?.botId).toBe("bot");
    expect(ledger.get("session-24999")?.botId).toBe("bot");
    expect(existsSync(missing)).toBe(false);
    expect(() => ledger.bind("bot", "new-session")).toThrow(/full/);
    expect(ledger.get("new-session")).toBeNull();
    expect(readFileSync(source, "utf8")).toBe(raw);
    expect(new BotConversationLedger(dir).get("session-0")?.botId).toBe("bot");
  });
}

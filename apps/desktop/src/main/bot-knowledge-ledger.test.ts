import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { SharedKnowledgeRecord } from "@doolittle/contracts/bots";
import { afterEach, describe, expect, it } from "vitest";
import { BotKnowledgeLedger } from "./bot-knowledge-ledger";

const directories: string[] = [];
afterEach(() => {
  for (const path of directories.splice(0))
    rmSync(path, { recursive: true, force: true });
});

function fixture(): { dir: string; record: SharedKnowledgeRecord } {
  const dir = mkdtempSync(resolve(tmpdir(), "doolittle-knowledge-ledger-"));
  directories.push(dir);
  const at = new Date().toISOString();
  return {
    dir,
    record: {
      id: "00000000-0000-4000-8000-000000000001",
      version: 1,
      documentId: "00000000-0000-4000-8000-000000000002",
      scope: { kind: "project", id: "project-1" },
      source: {
        botId: "source",
        agentId: "source-agent",
        sessionId: "session-1",
        runId: "run-1",
        projectId: "project-1",
        messageId: "message-1",
        links: [],
      },
      title: "Selected finding",
      promotedBy: "desktop-owner-consent",
      createdAt: at,
      updatedAt: at,
    },
  };
}

describe("BotKnowledgeLedger", () => {
  it("persists explicit grant and revocation without reviving a globally revoked document", () => {
    const { dir, record } = fixture();
    const ledger = new BotKnowledgeLedger(dir);
    ledger.promote(record);
    ledger.grant(record.id, "target");
    const grants = ledger.listGrants();
    expect(grants).toEqual([
      expect.objectContaining({ knowledgeId: record.id, botId: "target" }),
    ]);
    grants[0].botId = "mutated";
    expect(ledger.granted(record.id, "target")).toBe(true);
    expect(new BotKnowledgeLedger(dir).granted(record.id, "target")).toBe(true);
    ledger.revoke(record.id, "target");
    expect(new BotKnowledgeLedger(dir).granted(record.id, "target")).toBe(
      false,
    );
    ledger.grant(record.id, "target");
    ledger.revoke(record.id);
    expect(new BotKnowledgeLedger(dir).granted(record.id, "target")).toBe(
      false,
    );
    expect(() => ledger.grant(record.id, "target")).toThrow("unavailable");
  });

  it("recovers one damaged copy and fails closed when both copies lack valid provenance", () => {
    const { dir, record } = fixture();
    const ledger = new BotKnowledgeLedger(dir);
    ledger.promote(record);
    const primary = resolve(dir, "bots", "knowledge.json");
    const backup = resolve(dir, "bots", "knowledge.backup.json");
    writeFileSync(primary, "{broken");
    expect(new BotKnowledgeLedger(dir).get(record.id)?.source.messageId).toBe(
      "message-1",
    );
    const malformed = JSON.parse(readFileSync(backup, "utf8"));
    malformed.records[0].source.projectId = "other-project";
    writeFileSync(backup, JSON.stringify(malformed));
    expect(() => new BotKnowledgeLedger(dir)).toThrow(
      "Both knowledge ledger copies",
    );
  });
});

import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
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
  it("preserves ambiguous legacy provenance but blocks grants and retrieval, even after a duplicate is revoked", () => {
    const { dir, record } = fixture();
    mkdirSync(resolve(dir, "bots"));
    const other = {
      ...record,
      id: "00000000-0000-4000-8000-000000000099",
      scope: { kind: "project", id: "project-2" },
      source: {
        ...record.source,
        projectId: "project-2",
        runId: "other-run",
        messageId: "other-message",
      },
    };
    const saved = {
      version: 1,
      revision: 1,
      records: [record, other],
      grants: [
        {
          knowledgeId: record.id,
          botId: "target",
          grantedAt: record.createdAt,
        },
      ],
    };
    const raw = JSON.stringify(saved);
    for (const file of ["knowledge.json", "knowledge.backup.json"])
      writeFileSync(resolve(dir, "bots", file), raw);
    const ledger = new BotKnowledgeLedger(dir);
    expect(ledger.get(record.id)?.source).toEqual(record.source);
    expect(ledger.get(other.id)?.source).toEqual(other.source);
    expect(ledger.get(record.id)?.integrity?.status).toBe("ambiguous-document");
    expect(ledger.granted(record.id, "target")).toBe(false);
    expect(() => ledger.grant(other.id, "target")).toThrow("ambiguous");
    ledger.revoke(record.id);
    expect(() => ledger.grant(other.id, "target")).toThrow("ambiguous");
    expect(
      JSON.parse(
        readFileSync(resolve(dir, "bots", "knowledge.v1.backup.json"), "utf8"),
      ),
    ).toEqual(saved);
    expect(() =>
      ledger.promote({ ...other, id: "00000000-0000-4000-8000-000000000088" }),
    ).toThrow("already attached");
  });
  it("migrates project v1 once, preserves its rollback copy, and restores original metadata", () => {
    const { dir, record } = fixture();
    mkdirSync(resolve(dir, "bots"));
    const old = {
      version: 1,
      revision: 7,
      records: [record],
      grants: [
        {
          knowledgeId: record.id,
          botId: "target",
          grantedAt: record.createdAt,
        },
      ],
    };
    const primary = resolve(dir, "bots", "knowledge.json");
    const backup = resolve(dir, "bots", "knowledge.backup.json");
    writeFileSync(primary, JSON.stringify(old));
    writeFileSync(backup, JSON.stringify(old));
    const migrated = new BotKnowledgeLedger(dir);
    expect(migrated.get(record.id)).toEqual(record);
    expect(migrated.granted(record.id, "target")).toBe(true);
    const rollback = resolve(dir, "bots", "knowledge.v1.backup.json");
    const preserved = readFileSync(rollback, "utf8");
    expect(JSON.parse(preserved)).toEqual(old);
    expect(statSync(rollback).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(primary, "utf8"))).toMatchObject({
      version: 2,
      revision: 8,
    });
    const teamRecord = {
      ...record,
      id: "00000000-0000-4000-8000-000000000003",
      documentId: "00000000-0000-4000-8000-000000000005",
      scope: {
        kind: "team" as const,
        id: "00000000-0000-4000-8000-000000000004",
      },
    };
    migrated.promote(teamRecord);
    expect(new BotKnowledgeLedger(dir).get(teamRecord.id)).toEqual(teamRecord);
    expect(readFileSync(rollback, "utf8")).toBe(preserved);
    writeFileSync(primary, preserved);
    writeFileSync(backup, preserved);
    expect(new BotKnowledgeLedger(dir).list()).toEqual([record]);
  });
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
  it("rejects absent provenance identifiers rather than coercing undefined to an ID", () => {
    const { dir, record } = fixture();
    const ledger = new BotKnowledgeLedger(dir);
    ledger.promote(record);
    const primary = resolve(dir, "bots", "knowledge.json");
    const backup = resolve(dir, "bots", "knowledge.backup.json");
    const malformed = JSON.parse(readFileSync(primary, "utf8"));
    delete malformed.records[0].source.runId;
    for (const path of [primary, backup])
      writeFileSync(path, JSON.stringify(malformed));
    expect(() => new BotKnowledgeLedger(dir)).toThrow(
      "Both knowledge ledger copies",
    );
  });
});

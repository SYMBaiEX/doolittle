import { describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendGatewayJournalRecord,
  ensureGatewayJournalFile,
  loadGatewayJournal,
  persistGatewaySnapshotFiles,
} from "./journal";

describe("gateway journal helpers", () => {
  it("ensures and appends jsonl journal files", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-gateway-journal-"));
    const journalPath = join(root, "journal.jsonl");

    ensureGatewayJournalFile(journalPath);
    expect(existsSync(journalPath)).toBe(true);

    appendGatewayJournalRecord(journalPath, {
      at: "2026-03-29T12:00:00.000Z",
      message: "hello",
    });

    expect(
      loadGatewayJournal<{ at: string; message: string }>(journalPath),
    ).toEqual([
      {
        at: "2026-03-29T12:00:00.000Z",
        message: "hello",
      },
    ]);
  });

  it("ignores malformed journal lines during load", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-gateway-journal-"));
    const journalPath = join(root, "journal.jsonl");
    writeFileSync(
      journalPath,
      '{"at":"2026-03-29T12:00:00.000Z","ok":true}\nnot-json\n{"at":"2026-03-29T12:01:00.000Z","ok":false}\n',
      "utf8",
    );

    expect(
      loadGatewayJournal<{ at: string; ok: boolean }>(journalPath),
    ).toEqual([
      { at: "2026-03-29T12:00:00.000Z", ok: true },
      { at: "2026-03-29T12:01:00.000Z", ok: false },
    ]);
  });

  it("persists snapshot json and snapshot history entries together", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-gateway-journal-"));
    const snapshotPath = join(root, "gateway-state.json");
    const historyPath = join(root, "gateway-state-history.jsonl");

    const persistedAt = persistGatewaySnapshotFiles({
      snapshotPath,
      historyPath,
      persistedAt: "2026-03-29T12:34:56.000Z",
      snapshot: {
        updatedAt: "2026-03-29T12:34:55.000Z",
        reason: "manual",
        running: true,
      },
      historyEntry: {
        reason: "manual",
        state: { running: true },
      },
    });

    expect(persistedAt).toBe("2026-03-29T12:34:56.000Z");
    expect(JSON.parse(readFileSync(snapshotPath, "utf8"))).toEqual({
      persistedAt: "2026-03-29T12:34:56.000Z",
      updatedAt: "2026-03-29T12:34:55.000Z",
      reason: "manual",
      running: true,
    });
    expect(readFileSync(historyPath, "utf8").trim()).toBe(
      '{"persistedAt":"2026-03-29T12:34:56.000Z","reason":"manual","state":{"running":true}}',
    );
  });
});

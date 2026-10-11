import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  appendGatewayJournalRecord,
  appendGatewayJournalRecordDurably,
  ensureGatewayJournalFile,
  loadGatewayJournal,
  persistGatewaySnapshotFiles,
} from "./journal";

describe("gateway journal helpers", () => {
  it("never truncates existing entries when ensuring a journal", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-journal-existing-"));
    try {
      const path = join(root, "journal.jsonl");
      writeFileSync(path, '{"at":"original"}\n');
      ensureGatewayJournalFile(path);
      ensureGatewayJournalFile(path);
      expect(readFileSync(path, "utf8")).toBe('{"at":"original"}\n');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === "win32")(
    "rejects linked journals without altering the target and recovers",
    () => {
      const root = mkdtempSync(join(tmpdir(), "doolittle-journal-link-"));
      try {
        const path = join(root, "journal.jsonl");
        const target = join(root, "target");
        writeFileSync(target, "keep", { mode: 0o644 });
        symlinkSync(target, path);
        expect(() => ensureGatewayJournalFile(path)).toThrow();
        expect(() =>
          appendGatewayJournalRecordDurably(path, { at: "now" }),
        ).toThrow();
        expect(readFileSync(target, "utf8")).toBe("keep");
        expect(statSync(target).mode & 0o777).toBe(0o644);
        unlinkSync(path);
        appendGatewayJournalRecord(path, { at: "recovered" });
        expect(loadGatewayJournal(path)).toEqual([{ at: "recovered" }]);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );

  it("ensures and appends jsonl journal files", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-gateway-journal-"));
    const journalPath = join(root, "journal.jsonl");

    ensureGatewayJournalFile(journalPath);
    expect(existsSync(journalPath)).toBe(true);
    if (process.platform !== "win32") {
      expect(statSync(root).mode & 0o777).toBe(0o700);
      expect(statSync(journalPath).mode & 0o777).toBe(0o600);
    }

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

  it("retries short durable writes until the complete journal line is written", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-gateway-journal-"));
    const journalPath = join(root, "journal.jsonl");
    const chunks: string[] = [];
    appendGatewayJournalRecordDurably(
      journalPath,
      { at: "2026-03-29T12:00:00.000Z", message: "hello" },
      {
        open: () => 1,
        write: (_descriptor, buffer, offset, length) => {
          const size = Math.min(3, length);
          chunks.push(
            Buffer.from(buffer)
              .subarray(offset, offset + size)
              .toString(),
          );
          return size;
        },
        fsync: () => undefined,
        close: () => undefined,
      },
    );
    expect(chunks.join("")).toBe(
      '{"at":"2026-03-29T12:00:00.000Z","message":"hello"}\n',
    );
  });

  it("fails durable appends that make no write progress", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-gateway-journal-"));
    const journalPath = join(root, "journal.jsonl");
    expect(() =>
      appendGatewayJournalRecordDurably(
        journalPath,
        { at: "2026-03-29T12:00:00.000Z" },
        {
          open: () => 1,
          write: () => 0,
          fsync: () => undefined,
          close: () => undefined,
        },
      ),
    ).toThrow("no write progress");
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
    if (process.platform !== "win32") {
      expect(statSync(root).mode & 0o777).toBe(0o700);
      expect(statSync(snapshotPath).mode & 0o777).toBe(0o600);
      expect(statSync(historyPath).mode & 0o777).toBe(0o600);
    }
  });
});

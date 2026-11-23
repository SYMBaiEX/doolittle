import { appendFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
  createTrajectoryEventJournal,
  readTrajectoryEventRecords,
  TRAJECTORY_EVENT_JOURNAL,
} from "../../packages/agent/src/services/trajectory/event-journal";

it("keeps earlier events when the journal's final line is torn by a crash", async () => {
  const dir = await mkdtemp(join(tmpdir(), "doolittle-trajectory-journal-"));
  try {
    const journal = createTrajectoryEventJournal(dir);
    const first = journal.append({
      event: "response.created",
      category: "run",
      sessionId: "session-1",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const second = journal.append({
      event: "agent.progress",
      category: "run",
      sessionId: "session-1",
      createdAt: "2026-01-01T00:00:01.000Z",
    });
    // Simulate a crash mid-appendFileSync: a partial JSON line with no newline.
    appendFileSync(journal.path, '{"kind":"event","sessionId":"sess', "utf8");

    const recent = journal.recent(100);
    expect(recent.map((record) => record.event)).toEqual([
      "agent.progress",
      "response.created",
    ]);
    expect(recent).toEqual([second, first]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it("skips corrupt middle lines instead of discarding every event", async () => {
  const dir = await mkdtemp(join(tmpdir(), "doolittle-trajectory-journal-"));
  try {
    const journal = createTrajectoryEventJournal(dir);
    const first = journal.append({
      event: "response.created",
      category: "run",
      sessionId: "session-1",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    appendFileSync(journal.path, "not json at all\n", "utf8");
    const second = journal.append({
      event: "agent.progress",
      category: "run",
      sessionId: "session-1",
      createdAt: "2026-01-01T00:00:01.000Z",
    });

    expect(journal.recent(100)).toEqual([second, first]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it("still applies filters, sort order and limit to a journal with a torn line", async () => {
  const dir = await mkdtemp(join(tmpdir(), "doolittle-trajectory-journal-"));
  try {
    const journal = createTrajectoryEventJournal(dir);
    journal.append({
      event: "response.created",
      category: "run",
      sessionId: "session-1",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    journal.append({
      event: "agent.progress",
      category: "run",
      sessionId: "other",
      createdAt: "2026-01-01T00:00:02.000Z",
    });
    const latest = journal.append({
      event: "agent.progress",
      category: "run",
      sessionId: "session-1",
      createdAt: "2026-01-01T00:00:01.000Z",
    });
    appendFileSync(journal.path, '{"truncated"', "utf8");

    expect(journal.recent(1, { sessionId: "session-1" })).toEqual([latest]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it("returns no records for a journal that is only a torn line", async () => {
  const dir = await mkdtemp(join(tmpdir(), "doolittle-trajectory-journal-"));
  try {
    const path = join(dir, TRAJECTORY_EVENT_JOURNAL);
    writeFileSync(path, '{"kind":"event","sessionId":"par', "utf8");
    expect(readTrajectoryEventRecords(path)).toEqual([]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

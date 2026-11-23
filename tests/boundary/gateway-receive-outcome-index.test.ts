import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import type { GatewayInboxRecord } from "../../packages/agent/src/gateway/read/history-view";
import { loadGatewayJournal } from "../../packages/agent/src/gateway/recording/journal";
import {
  GatewayRunnerRecording,
  type GatewayRunnerRecordingDeps,
} from "../../packages/agent/src/gateway/runner/recording";

const directories: string[] = [];
afterEach(() => {
  for (const path of directories.splice(0))
    rmSync(path, { recursive: true, force: true });
});

const message = {
  platform: "slack" as const,
  userId: "user",
  roomId: "room",
  text: "hello",
};
const first = { ok: true, response: "first" };
const latest = { ok: false, response: "latest" };

function fixture() {
  const path = mkdtempSync(join(tmpdir(), "receive-outcome-index-"));
  directories.push(path);
  const inboxPath = join(path, "inbox.jsonl");
  const load = () => {
    const deps: GatewayRunnerRecordingDeps = {
      inboxLog: loadGatewayJournal<GatewayInboxRecord>(inboxPath),
      traceLog: [],
      outboxLog: [],
      attachmentLog: [],
      supervisionLog: [],
      inboxPath,
      outboxPath: join(path, "outbox.jsonl"),
      attachmentsPath: join(path, "attachments.jsonl"),
      supervisionPath: join(path, "supervision.jsonl"),
      runtimeStatusPath: join(path, "runtime.json"),
      ensurePlatformState: () => {
        throw new Error("Unexpected platform update");
      },
      updatePlatformStateFromTrace: () => {},
      getRuntimeStatus: () => {
        throw new Error("Unexpected runtime status");
      },
    };
    return { recording: new GatewayRunnerRecording(deps), deps };
  };
  return { inboxPath, load };
}

it("keeps the latest appended outcome per key and restores it from disk", () => {
  const { load } = fixture();
  const { recording } = load();
  expect(recording.findReceiveOutcome("unknown")).toBeUndefined();
  recording.recordReceiveOutcome(message, "one", first);
  recording.recordReceiveOutcome(message, "two", first);
  recording.recordReceiveOutcome(message, "one", latest);
  expect(recording.findReceiveOutcome("one")).toBe(latest);
  expect(recording.findReceiveOutcome("two")).toBe(first);
  const reloaded = load().recording;
  expect(reloaded.findReceiveOutcome("one")).toEqual(latest);
  expect(reloaded.findReceiveOutcome("two")).toEqual(first);
  expect(reloaded.findReceiveOutcome("unknown")).toBeUndefined();
});

it("matches the scan for malformed lines, unrelated records, empty keys and non-undefined outcomes", () => {
  const { inboxPath, load } = fixture();
  const records = [
    { idempotencyKey: "one", outcome: latest, at: "2000-01-02" },
    {
      idempotencyKey: "one",
      outcome: first,
      at: "2000-01-01",
      status: "rejected",
    },
    { idempotencyKey: "one" },
    { unrelated: true },
    42,
    "other",
    null,
    false,
    { idempotencyKey: "", outcome: first },
    { idempotencyKey: "null", outcome: first },
    { idempotencyKey: "null", outcome: null },
    { idempotencyKey: "false", outcome: false },
  ];
  writeFileSync(
    inboxPath,
    `${records.map((record) => JSON.stringify(record)).join("\n")}\nmalformed\n`,
  );
  const { recording, deps } = load();
  for (const key of ["one", "", "null", "false", "unknown"]) {
    const scanned = deps.inboxLog
      .slice()
      .reverse()
      .find(
        (record) =>
          record.idempotencyKey === key && record.outcome !== undefined,
      )?.outcome;
    expect(recording.findReceiveOutcome(key)).toEqual(scanned);
  }
  expect(recording.findReceiveOutcome("one")).toEqual(first);
  expect(recording.findReceiveOutcome("null")).toBeNull();
});

it("preserves the in-memory outcome when journal append fails", () => {
  const { load } = fixture();
  const { recording, deps } = load();
  recording.recordReceiveOutcome(message, "one", first);
  deps.inboxPath = join(deps.inboxPath, "not-a-directory");
  expect(() =>
    recording.recordReceiveOutcome(message, "one", latest),
  ).toThrow();
  expect(recording.findReceiveOutcome("one")).toBe(latest);
  expect(load().recording.findReceiveOutcome("one")).toEqual(first);
});

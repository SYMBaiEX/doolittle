import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  ACTION_DIAGNOSTIC_BYTE_LIMIT,
  ACTION_DIAGNOSTIC_EVENT_LIMIT,
  readActionOutcomes,
} from "../../packages/evals/src/headless/action-outcomes";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "doolittle-action-outcome-test-")),
  );
  roots.push(root);
  mkdirSync(join(root, "trajectories"));
  return {
    root,
    journal: join(root, "trajectories", "trajectory-events.jsonl"),
  };
}
function event(event: string, action: string, success?: boolean) {
  return JSON.stringify({
    category: "action",
    event,
    metadata: { action, ...(success === undefined ? {} : { success }) },
  });
}

it("counts action occurrences by category and distinguishes success, failure, and unknown results", () => {
  const { root, journal } = fixture();
  const success = event("action.completed", "SHELL", true);
  writeFileSync(
    journal,
    [
      event("action.started", "SHELL"),
      success,
      success,
      event("action.completed", "WRITE_FILE", false),
      event("action.completed", "TASKS_SPAWN_AGENT"),
      event("action.completed", "UNRECOGNIZED_ACTION", true),
      JSON.stringify({ category: "model", event: "model.request" }),
    ].join("\n"),
  );
  const outcomes = readActionOutcomes(root);
  expect(outcomes).toMatchObject({
    status: "complete",
    acceptedEvents: 6,
    rejectedRecords: 0,
  });
  expect(outcomes.categories.shell).toEqual({
    started: 1,
    completed: 2,
    success: 2,
    failure: 0,
    unknown: 0,
  });
  expect(outcomes.categories.files.failure).toBe(1);
  expect(outcomes.categories.delegation.unknown).toBe(1);
  expect(outcomes.categories.other.success).toBe(1);
  expect(JSON.stringify(outcomes)).not.toContain("UNRECOGNIZED_ACTION");
});

it("distinguishes missing and empty journals and rejects malformed records without losing valid counts", () => {
  const { root, journal } = fixture();
  expect(readActionOutcomes(root)).toMatchObject({
    status: "unavailable",
    journalAvailable: false,
  });
  writeFileSync(journal, "");
  expect(readActionOutcomes(root)).toMatchObject({
    status: "complete",
    acceptedEvents: 0,
  });
  writeFileSync(
    journal,
    [
      "broken JSON",
      "null",
      event("action.failed", "SHELL"),
      event("action.completed", "SHELL", false),
    ].join("\n"),
  );
  expect(readActionOutcomes(root)).toMatchObject({
    status: "partial",
    acceptedEvents: 1,
    rejectedRecords: 3,
    categories: { shell: { failure: 1 } },
  });
});

it("bounds both journal bytes and accepted event counts", () => {
  const { root, journal } = fixture();
  writeFileSync(
    journal,
    `${event("action.started", "SHELL")}\n`.repeat(
      ACTION_DIAGNOSTIC_EVENT_LIMIT + 1,
    ),
  );
  expect(readActionOutcomes(root)).toMatchObject({
    status: "partial",
    truncated: true,
    acceptedEvents: ACTION_DIAGNOSTIC_EVENT_LIMIT,
  });
  writeFileSync(journal, "x".repeat(ACTION_DIAGNOSTIC_BYTE_LIMIT + 1));
  expect(readActionOutcomes(root)).toMatchObject({
    status: "partial",
    truncated: true,
    bytesRead: ACTION_DIAGNOSTIC_BYTE_LIMIT,
    acceptedEvents: 0,
  });
});

it.skipIf(process.platform === "win32")(
  "refuses a symlinked journal rather than reading foreign data",
  () => {
    const { root, journal } = fixture();
    const foreign = join(root, "foreign.jsonl");
    writeFileSync(foreign, event("action.completed", "SHELL", true));
    symlinkSync(foreign, journal);
    expect(readActionOutcomes(root)).toMatchObject({
      status: "partial",
      bytesRead: 0,
      acceptedEvents: 0,
    });
  },
);

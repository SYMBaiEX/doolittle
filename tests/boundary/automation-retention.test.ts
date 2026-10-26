import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  type AutomationTargetFire,
  BotAutomationLedger,
} from "../../apps/desktop/src/main/bot-automation-ledger";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
function fixture() {
  const dir = mkdtempSync(resolve(tmpdir(), "doolittle-automation-retention-"));
  dirs.push(dir);
  mkdirSync(resolve(dir, "bots"));
  const jobId = randomUUID(),
    targetBotId = randomUUID(),
    approvalId = randomUUID();
  const stamp = "2026-10-25T00:00:00.000Z";
  const approval = {
    id: approvalId,
    jobId,
    targetBotId,
    targetRevision: stamp,
    definitionDigest: "a".repeat(64),
    workspacePath: resolve(dir),
    createdAt: stamp,
    permissions: {
      connectionIds: [],
      workspacePaths: [],
      toolIds: [],
      allowMutation: false,
      allowDelegation: false,
    },
  };
  function fire(
    index: number,
    status: AutomationTargetFire["status"] = "complete",
  ): AutomationTargetFire {
    const fireId = randomUUID();
    return {
      fireId,
      fireKeyDigest: index.toString(16).padStart(64, "0"),
      jobId,
      targetBotId,
      approvalId,
      sessionId: `automation:${jobId}:${fireId}`,
      runId: `automation:${fireId}`,
      status,
      createdAt: stamp,
      updatedAt: stamp,
    };
  }
  const fires = Array.from({ length: 5000 }, (_, index) => fire(index));
  fires[0] = fire(0, "accepted");
  const raw = JSON.stringify({
    version: 1,
    revision: 0,
    approvals: [approval],
    fires,
  });
  const path = resolve(dir, "bots/automation-dispatches.json");
  const backup = resolve(dir, "bots/automation-dispatches.backup.json");
  writeFileSync(path, raw);
  writeFileSync(backup, raw);
  return { dir, path, backup, fires, fire, jobId, approval };
}
it("runs beyond the old capacity and retains active work and permanent replay identities across restart", () => {
  const f = fixture();
  let ledger = new BotAutomationLedger(f.dir);
  for (let index = 5000; index < 5020; index++) {
    const next = f.fire(index, "prepared");
    ledger.prepare(next);
    ledger.update(next.fireId, "complete");
  }
  ledger = new BotAutomationLedger(f.dir);
  expect(ledger.list().length).toBeLessThanOrEqual(257);
  expect(ledger.get(f.fires[0].fireId)?.status).toBe("accepted");
  const archived = f.fires[4999];
  expect(ledger.forKey(f.jobId, archived.fireKeyDigest)).toEqual(archived);
  expect(ledger.byRun(archived.runId)).toEqual(archived);
  expect(() => ledger.prepare(archived)).toThrow(/already exists/);
  expect(readFileSync(f.path).byteLength).toBeLessThan(200_000);
});
it("recovers an archive committed before an interrupted hot-ledger publication", () => {
  const f = fixture();
  const ledger = new BotAutomationLedger(f.dir);
  renameSync(f.path, `${f.path}.old`);
  mkdirSync(f.path);
  expect(() => ledger.prepare(f.fire(6000, "prepared"))).toThrow();
  expect(() => ledger.list()).toThrow(/recovery/);
  const restored = new BotAutomationLedger(f.dir);
  expect(restored.get(f.fires[0].fireId)).toEqual(f.fires[0]);
  expect(restored.forKey(f.jobId, f.fires[4999].fireKeyDigest)).toEqual(
    f.fires[4999],
  );
  expect(() => restored.prepare(f.fires[4999])).toThrow(/already exists/);
});
it("refuses a missing archive instead of forgetting old replay identities", () => {
  const f = fixture();
  const ledger = new BotAutomationLedger(f.dir);
  ledger.prepare(f.fire(6000, "prepared"));
  rmSync(resolve(f.dir, "bots/automation-history.sqlite"));
  expect(() => ledger.forKey(f.jobId, f.fires[4999].fireKeyDigest)).toThrow(
    /history is missing/,
  );
  expect(() => new BotAutomationLedger(f.dir)).toThrow(/history is missing/);
});

it("archives superseded approvals without substituting the current authorization", () => {
  const f = fixture();
  const ledger = new BotAutomationLedger(f.dir);
  ledger.prepare(f.fire(6000, "prepared"));
  const next = {
    ...f.approval,
    id: randomUUID(),
    definitionDigest: "b".repeat(64),
  };
  ledger.approve(next);
  // The old active run still pins its original approval in the hot ledger.
  expect(ledger.approval(f.approval.id)).toEqual(f.approval);
  ledger.update(f.fires[0].fireId, "complete");
  // A fresh job without fires can retire its previous approval immediately.
  const other = { ...f.approval, id: randomUUID(), jobId: randomUUID() };
  ledger.approve(other);
  ledger.approve({
    ...other,
    id: randomUUID(),
    definitionDigest: "c".repeat(64),
  });
  const restored = new BotAutomationLedger(f.dir);
  expect(restored.approval(other.id)).toEqual(other);
  expect(
    JSON.parse(readFileSync(f.path, "utf8")).approvals.some(
      (row: { id: string }) => row.id === other.id,
    ),
  ).toBe(false);
});

it("refuses corrupt cold history instead of treating archived fires as unsubmitted", () => {
  const f = fixture();
  const ledger = new BotAutomationLedger(f.dir);
  ledger.prepare(f.fire(6000, "prepared"));
  writeFileSync(
    resolve(f.dir, "bots/automation-history.sqlite"),
    "not a database",
  );
  expect(() => ledger.forKey(f.jobId, f.fires[4999].fireKeyDigest)).toThrow();
  expect(() => new BotAutomationLedger(f.dir)).toThrow();
});

it("rejects a symlinked archive without touching the target", () => {
  const f = fixture();
  const ledger = new BotAutomationLedger(f.dir);
  ledger.prepare(f.fire(6000, "prepared"));
  const archive = resolve(f.dir, "bots/automation-history.sqlite");
  const outside = resolve(f.dir, "outside");
  writeFileSync(outside, "preserved");
  rmSync(archive);
  symlinkSync(outside, archive);
  expect(() => ledger.forKey(f.jobId, f.fires[4999].fireKeyDigest)).toThrow();
  expect(readFileSync(outside, "utf8")).toBe("preserved");
});

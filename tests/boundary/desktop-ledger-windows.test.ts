import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, expect, it, vi } from "vitest";

// Exercise Windows validation while keeping the fixture files on this host.
vi.mock("node:path", async () => {
  const native = await vi.importActual<typeof import("node:path")>("node:path");
  return {
    ...native,
    isAbsolute: (path: string) =>
      /^[A-Za-z]:/u.test(path)
        ? native.win32.isAbsolute(path)
        : native.isAbsolute(path),
    resolve: (...paths: string[]) =>
      paths.length === 1 && /^[A-Za-z]:/u.test(paths[0] ?? "")
        ? native.win32.resolve(...paths)
        : native.resolve(...paths),
  };
});

import { BotAutomationLedger } from "../../apps/desktop/src/main/bot-automation-ledger";
import { BotConsultationLedger } from "../../apps/desktop/src/main/bot-consultation-ledger";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
function fixture(file: string, value: unknown): string {
  const dir = mkdtempSync(resolve(tmpdir(), "doolittle-windows-ledger-"));
  dirs.push(dir);
  mkdirSync(resolve(dir, "bots"));
  writeFileSync(resolve(dir, "bots", file), JSON.stringify(value));
  return dir;
}
const workspacePath = "C:\\Users\\operator\\workspace";
const stamp = new Date().toISOString();
const permissions = {
  connectionIds: [],
  workspacePaths: [workspacePath],
  toolIds: [],
  allowMutation: true,
  allowDelegation: true,
};
it("restores an automation approval with a canonical Windows workspace", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  const approval = {
    id,
    jobId: id,
    targetBotId: id,
    targetRevision: stamp,
    definitionDigest: "a".repeat(64),
    permissions,
    workspacePath,
    createdAt: stamp,
  };
  const dir = fixture("automation-dispatches.json", {
    version: 1,
    revision: 0,
    approvals: [approval],
    fires: [],
  });
  expect(new BotAutomationLedger(dir).approval(id)?.workspacePath).toBe(
    workspacePath,
  );
});
it("restores a consultation with a canonical Windows workspace", () => {
  const record = {
    dispatchId: "dispatch-1",
    rootRunId: "root-1",
    ancestry: [],
    depth: 1,
    origin: {
      runId: "origin-run",
      sessionId: "origin-session",
      botId: "bot-a",
    },
    targetBotId: "bot-b",
    targetSessionId: "target-session",
    targetRunId: "target-run",
    permissions,
    workspacePath,
    deadline: stamp,
    status: "prepared",
    createdAt: stamp,
    updatedAt: stamp,
  };
  const dir = fixture("consultations.json", {
    version: 1,
    revision: 0,
    records: [record],
  });
  expect(
    new BotConsultationLedger(dir).get(record.dispatchId)?.workspacePath,
  ).toBe(workspacePath);
});

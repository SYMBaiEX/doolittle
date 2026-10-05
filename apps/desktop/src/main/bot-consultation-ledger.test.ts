import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BotConsultationLedger,
  type BotConsultationRecord,
} from "./bot-consultation-ledger";

function record(): BotConsultationRecord {
  return {
    dispatchId: "dispatch-1",
    rootRunId: "run-root",
    ancestry: ["bot-a"],
    depth: 1,
    origin: {
      botId: "bot-a",
      agentId: "agent-a",
      sessionId: "session-a",
      runId: "run-root",
    },
    targetBotId: "bot-b",
    targetSessionId: "session-b",
    targetRunId: "consult:dispatch-1",
    permissions: {
      connectionIds: [],
      workspacePaths: ["/workspace"],
      toolIds: [],
      allowMutation: false,
      allowDelegation: false,
    },
    deadline: "2026-10-05T00:00:00.000Z",
    status: "prepared",
    createdAt: "2026-10-04T00:00:00.000Z",
    updatedAt: "2026-10-04T00:00:00.000Z",
  };
}

describe("BotConsultationLedger", () => {
  it("persists prepared intent before acceptance and never allows duplicate dispatch", () => {
    const directory = mkdtempSync(
      resolve(tmpdir(), "doolittle-consultations-"),
    );
    try {
      const ledger = new BotConsultationLedger(directory);
      ledger.prepare(record());
      expect(() => ledger.prepare(record())).toThrow(/already exists/iu);
      expect(ledger.countRoot("run-root")).toBe(1);
      const reopened = new BotConsultationLedger(directory);
      expect(reopened.get("dispatch-1")).toMatchObject({
        status: "prepared",
        targetRunId: "consult:dispatch-1",
      });
      reopened.update("dispatch-1", "accepted");
      expect(
        new BotConsultationLedger(directory).get("dispatch-1")?.status,
      ).toBe("accepted");
      expect(() => reopened.prepare(record())).toThrow(/already exists/iu);
      expect(reopened.byTargetRun("consult:dispatch-1")?.dispatchId).toBe(
        "dispatch-1",
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("recovers from one corrupt copy without replaying its prepared dispatch", () => {
    const directory = mkdtempSync(
      resolve(tmpdir(), "doolittle-consultations-"),
    );
    try {
      new BotConsultationLedger(directory).prepare(record());
      const primary = resolve(directory, "bots", "consultations.json");
      const backup = resolve(directory, "bots", "consultations.backup.json");
      expect(JSON.parse(readFileSync(backup, "utf8")).records).toHaveLength(1);
      writeFileSync(primary, "not-json");
      const recovered = new BotConsultationLedger(directory);
      expect(recovered.get("dispatch-1")?.status).toBe("prepared");
      expect(() => recovered.prepare(record())).toThrow(/already exists/iu);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

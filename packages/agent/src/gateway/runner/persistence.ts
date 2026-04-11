import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  type GatewayAttachmentRecord,
  GatewayHistoryView,
  type GatewayInboxRecord,
  type GatewayOutboxRecord,
  type GatewayTraceRecord,
} from "@/gateway/read/history-view";
import {
  ensureGatewayJournalFile,
  loadGatewayJournal,
} from "@/gateway/recording/journal";
import type { GatewayRunnerContext } from "@/gateway/runner/context";
import type { GatewaySupervisionRecord } from "@/gateway/supervision/index";

export interface GatewayRunnerPersistenceState {
  snapshotDir: string;
  journalDir: string;
  snapshotPath: string;
  snapshotHistoryPath: string;
  runtimeStatusPath: string;
  supervisionPath: string;
  inboxPath: string;
  outboxPath: string;
  attachmentsPath: string;
  traceLog: GatewayTraceRecord[];
  inboxLog: GatewayInboxRecord[];
  outboxLog: GatewayOutboxRecord[];
  attachmentLog: GatewayAttachmentRecord[];
  supervisionLog: GatewaySupervisionRecord[];
  historyView: GatewayHistoryView;
}

export function initializeGatewayRunnerPersistence(
  context: GatewayRunnerContext,
): GatewayRunnerPersistenceState {
  const snapshotDir = join(context.config.gatewayDataDir, "snapshots");
  const journalDir = join(context.config.gatewayDataDir, "journals");
  const snapshotPath = join(snapshotDir, "gateway-state.json");
  const snapshotHistoryPath = join(snapshotDir, "gateway-state-history.jsonl");
  const runtimeStatusPath = join(snapshotDir, "gateway-runtime.json");
  const supervisionPath = join(journalDir, "gateway-supervision.jsonl");
  const inboxPath = join(journalDir, "gateway-inbox.jsonl");
  const outboxPath = join(journalDir, "gateway-outbox.jsonl");
  const attachmentsPath = join(journalDir, "gateway-attachments.jsonl");

  mkdirSync(snapshotDir, { recursive: true });
  mkdirSync(journalDir, { recursive: true });
  ensureGatewayJournalFile(inboxPath);
  ensureGatewayJournalFile(outboxPath);
  ensureGatewayJournalFile(attachmentsPath);
  ensureGatewayJournalFile(supervisionPath);

  const traceLog: GatewayTraceRecord[] = [];
  const inboxLog = loadGatewayJournal<GatewayInboxRecord>(inboxPath);
  const outboxLog = loadGatewayJournal<GatewayOutboxRecord>(outboxPath);
  const attachmentLog =
    loadGatewayJournal<GatewayAttachmentRecord>(attachmentsPath);
  const supervisionLog =
    loadGatewayJournal<GatewaySupervisionRecord>(supervisionPath);
  const historyView = new GatewayHistoryView({
    traceLog,
    inboxLog,
    outboxLog,
    attachmentLog,
    recentDeliveries: (limit) => context.services.delivery.recent(limit),
    listSessions: () => context.services.gatewaySessions.list(),
  });

  return {
    snapshotDir,
    journalDir,
    snapshotPath,
    snapshotHistoryPath,
    runtimeStatusPath,
    supervisionPath,
    inboxPath,
    outboxPath,
    attachmentsPath,
    traceLog,
    inboxLog,
    outboxLog,
    attachmentLog,
    supervisionLog,
    historyView,
  };
}

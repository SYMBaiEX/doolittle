import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { DeliveredMessageRecord } from "@/types/gateway";
import type {
  GatewayAttachmentRecord,
  GatewayInboxRecord,
  GatewayOutboxRecord,
} from "../read/history-view";
import { ensureGatewayJournalFile, loadGatewayJournal } from "./journal";
import {
  recordGatewayInboxJournalEntry,
  recordGatewayOutboxJournalEntry,
} from "./message-journal";

describe("gateway message journal helpers", () => {
  it("records inbox entries and persists attachment rows", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-gateway-journal-"));
    const inboxPath = join(root, "gateway-inbox.jsonl");
    const attachmentsPath = join(root, "gateway-attachments.jsonl");
    ensureGatewayJournalFile(inboxPath);
    ensureGatewayJournalFile(attachmentsPath);

    const recordLog: GatewayInboxRecord[] = [];
    const attachmentLog: GatewayAttachmentRecord[] = [];

    try {
      const result = recordGatewayInboxJournalEntry({
        at: "2026-03-30T00:00:00.000Z",
        traceId: "trace-inbox",
        sessionId: "session-1",
        status: "accepted",
        notes: ["paired"],
        message: {
          platform: "api",
          userId: "user-1",
          roomId: "room-1",
          text: "hello from api",
          messageId: "message-1",
          metadata: {
            attachmentCount: "2",
            attachmentKinds: "image|document",
            attachmentNames: "Snap|Brief.pdf",
            attachmentUrls:
              "https://example.com/snap.png|https://example.com/brief.pdf",
            attachmentMimeTypes: "image/png|application/pdf",
          },
        },
        recordLog,
        recordPath: inboxPath,
        attachmentLog,
        attachmentsPath,
      });

      expect(result.record.status).toBe("accepted");
      expect(result.record.notes).toEqual(["paired"]);
      expect(result.record.attachmentKinds).toEqual(["image", "document"]);
      expect(result.record.metadataKeys).toEqual([
        "attachmentCount",
        "attachmentKinds",
        "attachmentNames",
        "attachmentUrls",
        "attachmentMimeTypes",
      ]);
      expect(result.attachments).toHaveLength(2);
      expect(result.attachments[0]?.recordId).toBe(result.record.recordId);
      expect(result.attachments[1]?.kind).toBe("document");
      expect(recordLog).toHaveLength(1);
      expect(attachmentLog).toHaveLength(2);
      expect(loadGatewayJournal<GatewayInboxRecord>(inboxPath)).toHaveLength(1);
      expect(
        loadGatewayJournal<GatewayAttachmentRecord>(attachmentsPath),
      ).toHaveLength(2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("records outbox entries and persists delivery-linked attachments", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-gateway-journal-"));
    const outboxPath = join(root, "gateway-outbox.jsonl");
    const attachmentsPath = join(root, "gateway-attachments.jsonl");
    ensureGatewayJournalFile(outboxPath);
    ensureGatewayJournalFile(attachmentsPath);

    const recordLog: GatewayOutboxRecord[] = [];
    const attachmentLog: GatewayAttachmentRecord[] = [];
    const delivery: DeliveredMessageRecord = {
      id: "delivery-1",
      target: {
        platform: "telegram",
        channelId: "room-2",
        userId: "user-2",
        mode: "explicit",
      },
      text: "sent text",
      createdAt: "2026-03-30T00:00:01.000Z",
      metadata: {
        preserved: "true",
      },
    };

    try {
      const result = recordGatewayOutboxJournalEntry({
        at: "2026-03-30T00:00:02.000Z",
        platform: "telegram",
        traceId: "trace-outbox",
        sessionId: "session-2",
        delivery,
        message: {
          roomId: "room-2",
          userId: "user-2",
          text: "outbound text",
          threadId: "thread-1",
          replyToId: "reply-1",
          metadata: {
            attachmentCount: "1",
            attachmentKinds: "voice",
            attachmentNames: "voice.mp3",
            attachmentUrls: "https://example.com/voice.mp3",
            attachmentMimeTypes: "audio/mpeg",
          },
        },
        status: "sent",
        recordLog,
        recordPath: outboxPath,
        attachmentLog,
        attachmentsPath,
      });

      expect(result.record.deliveryId).toBe("delivery-1");
      expect(result.record.outbound).toBeUndefined();
      expect(result.record.replyToMessageId).toBe("reply-1");
      expect(result.record.attachmentNames).toEqual(["voice.mp3"]);
      expect(result.attachments).toHaveLength(1);
      expect(result.attachments[0]?.deliveryId).toBe("delivery-1");
      expect(result.attachments[0]?.kind).toBe("voice");
      expect(recordLog).toHaveLength(1);
      expect(attachmentLog).toHaveLength(1);
      expect(
        loadGatewayJournal<GatewayOutboxRecord>(outboxPath)[0]?.deliveryId,
      ).toBe("delivery-1");
      expect(
        loadGatewayJournal<GatewayOutboxRecord>(outboxPath)[0]?.outbound,
      ).toBeUndefined();
      expect(
        loadGatewayJournal<GatewayAttachmentRecord>(attachmentsPath)[0]
          ?.deliveryId,
      ).toBe("delivery-1");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("durably records a rejected intended payload without marking it sent", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-gateway-rejected-"));
    const outboxPath = join(root, "gateway-outbox.jsonl");
    const attachmentsPath = join(root, "gateway-attachments.jsonl");
    ensureGatewayJournalFile(outboxPath);
    ensureGatewayJournalFile(attachmentsPath);

    try {
      const rejected = recordGatewayOutboxJournalEntry({
        platform: "slack",
        traceId: "trace-rejected",
        sessionId: "session-rejected",
        message: {
          roomId: "room-rejected",
          userId: "user-rejected",
          text: "full intended payload",
          metadata: { accountId: "work", correlation: "abc" },
        },
        status: "rejected",
        notes: ["Authorization: [redacted]"],
        recordLog: [],
        recordPath: outboxPath,
        attachmentLog: [],
        attachmentsPath,
      });
      const retryPayload = rejected.record.outbound;
      if (!retryPayload) {
        throw new Error(
          "Rejected journal record must retain its retry payload.",
        );
      }
      recordGatewayOutboxJournalEntry({
        platform: "slack",
        traceId: "trace-retry",
        sessionId: "session-rejected",
        delivery: {
          id: "delivery-retried",
          target: {
            platform: "slack",
            channelId: "room-rejected",
            userId: "user-rejected",
            mode: "explicit",
          },
          text: "full intended payload",
          createdAt: "2026-08-15T00:00:00.000Z",
        },
        message: retryPayload,
        status: "sent",
        retryOfRecordId: rejected.record.recordId,
        recordLog: [],
        recordPath: outboxPath,
        attachmentLog: [],
        attachmentsPath,
      });

      const [record, retried] =
        loadGatewayJournal<GatewayOutboxRecord>(outboxPath);
      expect(record).toMatchObject({
        status: "rejected",
        outbound: {
          roomId: "room-rejected",
          text: "full intended payload",
          metadata: { accountId: "work", correlation: "abc" },
        },
        notes: ["Authorization: [redacted]"],
      });
      expect(record?.deliveryId).toBeUndefined();
      expect(retried).toMatchObject({
        status: "sent",
        deliveryId: "delivery-retried",
        retryOfRecordId: record?.recordId,
      });
      expect(retried?.outbound).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

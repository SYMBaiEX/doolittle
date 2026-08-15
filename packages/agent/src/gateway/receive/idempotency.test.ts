import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { IncomingPlatformMessage } from "@/types/gateway";
import type { GatewayInboxRecord } from "../read/history-view";
import { GatewayHistoryView } from "../read/history-view";
import {
  ensureGatewayJournalFile,
  loadGatewayJournal,
} from "../recording/journal";
import { recordGatewayInboxJournalEntry } from "../recording/message-journal";
import {
  GATEWAY_DELIVERY_PENDING_RESPONSE,
  GATEWAY_DUPLICATE_ACK_RESPONSE,
  GatewayReceiveIdempotencyCoordinator,
  gatewayInboundIdempotencyKey,
} from "./idempotency";
import {
  GATEWAY_PAIRING_RETRY_RESPONSE,
  type GatewayReceiveOutcome,
} from "./outcome-types";

function message(
  overrides: Partial<IncomingPlatformMessage> = {},
): IncomingPlatformMessage {
  return {
    platform: "api",
    userId: "user-1",
    roomId: "room-1",
    text: "same text",
    messageId: "message-1",
    ...overrides,
  };
}

function store() {
  const outcomes = new Map<string, GatewayReceiveOutcome>();
  return {
    outcomes,
    findOutcome: (key: string) => outcomes.get(key),
    recordOutcome: (
      _message: IncomingPlatformMessage,
      key: string,
      outcome: GatewayReceiveOutcome,
    ) => {
      outcomes.set(key, outcome);
    },
  };
}

describe("GatewayReceiveIdempotencyCoordinator", () => {
  it("joins concurrent retries to the same in-flight outcome", async () => {
    const durableStore = store();
    const coordinator = new GatewayReceiveIdempotencyCoordinator(durableStore);
    let resolve!: (outcome: GatewayReceiveOutcome) => void;
    const execute = vi.fn(
      () =>
        new Promise<GatewayReceiveOutcome>((done) => {
          resolve = done;
        }),
    );

    const first = coordinator.receive(message(), execute);
    const duplicate = coordinator.receive(message(), execute);
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    resolve({ ok: true, response: "computed once", traceId: "trace-1" });

    await expect(first).resolves.toEqual({
      ok: true,
      response: "computed once",
      traceId: "trace-1",
    });
    await expect(duplicate).resolves.toEqual({
      ok: true,
      response: GATEWAY_DUPLICATE_ACK_RESPONSE,
      traceId: "trace-1",
      duplicate: true,
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("returns a durable prior outcome after coordinator restart", async () => {
    const durableStore = store();
    const first = new GatewayReceiveIdempotencyCoordinator(durableStore);
    const outcome = {
      ok: false,
      response: "Authorization required. Pairing code: PAIR-1",
      pairingCode: "PAIR-1",
      traceId: "trace-pairing",
    };
    await first.receive(message(), async () => outcome);

    const restarted = new GatewayReceiveIdempotencyCoordinator(durableStore);
    const execute = vi.fn(async () => outcome);
    await expect(restarted.receive(message(), execute)).resolves.toEqual({
      ok: false,
      response: GATEWAY_PAIRING_RETRY_RESPONSE,
      traceId: "trace-pairing",
      duplicate: true,
    });
    expect(execute).not.toHaveBeenCalled();
    expect(JSON.stringify([...durableStore.outcomes.values()])).not.toContain(
      "PAIR-1",
    );
  });

  it("keeps live pairing responses but excludes pairing secrets from durable history", async () => {
    const root = mkdtempSync(join(tmpdir(), "gateway-pairing-outcome-"));
    const inboxPath = join(root, "inbox.jsonl");
    const attachmentsPath = join(root, "attachments.jsonl");
    ensureGatewayJournalFile(inboxPath);
    ensureGatewayJournalFile(attachmentsPath);
    const inbound = message();
    const liveOutcome = {
      ok: false,
      response: "Authorization required. Pairing code: SECRET-PAIR-90210",
      pairingCode: "SECRET-PAIR-90210",
      traceId: "trace-pairing-secret",
      idempotencyDisposition: "terminal" as const,
    };

    try {
      const coordinator = new GatewayReceiveIdempotencyCoordinator({
        findOutcome: () => undefined,
        recordOutcome: (received, idempotencyKey, outcome) => {
          recordGatewayInboxJournalEntry({
            traceId: outcome.traceId ?? "unknown",
            message: received,
            status: "completed",
            idempotencyKey,
            outcome,
            recordAttachments: false,
            recordLog: [],
            recordPath: inboxPath,
            attachmentLog: [],
            attachmentsPath,
          });
        },
      });
      const execute = vi.fn(async () => liveOutcome);
      const first = coordinator.receive(inbound, execute);
      const joined = coordinator.receive(inbound, execute);

      await expect(first).resolves.toEqual({
        ...liveOutcome,
        idempotencyDisposition: undefined,
      });
      await expect(joined).resolves.toEqual({
        ok: false,
        response: GATEWAY_PAIRING_RETRY_RESPONSE,
        traceId: "trace-pairing-secret",
        duplicate: true,
      });
      expect(execute).toHaveBeenCalledTimes(1);

      const rawJournal = readFileSync(inboxPath, "utf8");
      expect(rawJournal).not.toContain("SECRET-PAIR-90210");
      const reloaded = loadGatewayJournal<GatewayInboxRecord>(inboxPath);
      expect(readFileSync(inboxPath, "utf8")).not.toContain("durable response");
      const history = new GatewayHistoryView({
        traceLog: [],
        inboxLog: reloaded,
        outboxLog: [],
        attachmentLog: [],
        recentDeliveries: () => [],
        listSessions: () => [],
      });
      expect(JSON.stringify(history.inbox())).not.toContain(
        "SECRET-PAIR-90210",
      );
      expect(history.inbox()[0]?.outcome).toMatchObject({
        response: GATEWAY_PAIRING_RETRY_RESPONSE,
        idempotencyDisposition: "terminal",
      });
      expect(history.inbox()[0]?.outcome?.pairingCode).toBeUndefined();

      const restarted = new GatewayReceiveIdempotencyCoordinator({
        findOutcome: (key) =>
          reloaded.find((record) => record.idempotencyKey === key)?.outcome,
        recordOutcome: () => {
          throw new Error(
            "A restart duplicate must not append another record.",
          );
        },
      });
      await expect(restarted.receive(inbound, execute)).resolves.toEqual({
        ok: false,
        response: GATEWAY_PAIRING_RETRY_RESPONSE,
        traceId: "trace-pairing-secret",
        duplicate: true,
      });
      expect(execute).toHaveBeenCalledTimes(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reloads a completed outcome from the inbox journal after process restart", async () => {
    const root = mkdtempSync(join(tmpdir(), "gateway-idempotency-"));
    const inboxPath = join(root, "inbox.jsonl");
    const attachmentsPath = join(root, "attachments.jsonl");
    ensureGatewayJournalFile(inboxPath);
    ensureGatewayJournalFile(attachmentsPath);
    const inbound = message();
    const outcome = {
      ok: true,
      response: "durable response",
      traceId: "trace-durable",
      deliveryId: "delivery-durable",
      agentCompleted: true,
      deliveryStatus: "sent" as const,
    };

    try {
      const first = new GatewayReceiveIdempotencyCoordinator({
        findOutcome: () => undefined,
        recordOutcome: (received, idempotencyKey, receivedOutcome) => {
          recordGatewayInboxJournalEntry({
            traceId: receivedOutcome.traceId ?? "unknown",
            message: received,
            status: "completed",
            idempotencyKey,
            outcome: receivedOutcome,
            recordLog: [],
            recordPath: inboxPath,
            attachmentLog: [],
            attachmentsPath,
          });
        },
      });
      await first.receive(inbound, async () => outcome);

      const reloaded = loadGatewayJournal<GatewayInboxRecord>(inboxPath);
      const restarted = new GatewayReceiveIdempotencyCoordinator({
        findOutcome: (key) =>
          reloaded.find((record) => record.idempotencyKey === key)?.outcome,
        recordOutcome: () => {
          throw new Error("A durable duplicate must not be recorded again.");
        },
      });
      const execute = vi.fn(async () => outcome);

      await expect(restarted.receive(inbound, execute)).resolves.toEqual({
        ...outcome,
        response: GATEWAY_DUPLICATE_ACK_RESPONSE,
        duplicate: true,
      });
      expect(execute).not.toHaveBeenCalled();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("scopes upstream ids by platform, account, room, channel, and thread", () => {
    const base = gatewayInboundIdempotencyKey(message());
    expect(base).not.toBe(
      gatewayInboundIdempotencyKey(message({ platform: "slack" })),
    );
    expect(base).not.toBe(
      gatewayInboundIdempotencyKey(
        message({ metadata: { accountId: "work" } }),
      ),
    );
    expect(base).not.toBe(
      gatewayInboundIdempotencyKey(message({ roomId: "room-2" })),
    );
    expect(base).not.toBe(
      gatewayInboundIdempotencyKey(message({ channelId: "channel-2" })),
    );
    expect(base).not.toBe(
      gatewayInboundIdempotencyKey(message({ threadId: "thread-2" })),
    );
  });

  it("does not text-dedupe messages without a nonblank upstream id", async () => {
    const coordinator = new GatewayReceiveIdempotencyCoordinator(store());
    const execute = vi.fn(async () => ({ ok: true, response: "done" }));

    await coordinator.receive(message({ messageId: undefined }), execute);
    await coordinator.receive(message({ messageId: "   " }), execute);

    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("does not retain transport-not-ready and retries later execution", async () => {
    const durableStore = store();
    const coordinator = new GatewayReceiveIdempotencyCoordinator(durableStore);
    const execute = vi
      .fn<() => Promise<GatewayReceiveOutcome>>()
      .mockResolvedValueOnce({
        ok: false,
        response: "api transport is not ready for inbound traffic.",
        idempotencyDisposition: "transient",
      })
      .mockResolvedValueOnce({
        ok: true,
        response: "executed after transport recovery",
        agentCompleted: true,
      });

    await expect(coordinator.receive(message(), execute)).resolves.toEqual({
      ok: false,
      response: "api transport is not ready for inbound traffic.",
    });
    expect(durableStore.outcomes.size).toBe(0);

    await expect(coordinator.receive(message(), execute)).resolves.toEqual({
      ok: true,
      response: "executed after transport recovery",
      agentCompleted: true,
    });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(durableStore.outcomes.size).toBe(1);

    await expect(coordinator.receive(message(), execute)).resolves.toEqual({
      ok: true,
      response: GATEWAY_DUPLICATE_ACK_RESPONSE,
      agentCompleted: true,
      duplicate: true,
    });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("retains only a bounded delivery-pending acknowledgement", async () => {
    const durableStore = store();
    const coordinator = new GatewayReceiveIdempotencyCoordinator(durableStore);
    const liveResponse =
      "sensitive computed response that must not be retained";

    await expect(
      coordinator.receive(message(), async () => ({
        ok: false,
        response: liveResponse,
        agentCompleted: true,
        deliveryStatus: "rejected",
        outboxRecordId: "outbox-rejected",
      })),
    ).resolves.toMatchObject({ response: liveResponse });

    expect(JSON.stringify([...durableStore.outcomes.values()])).not.toContain(
      liveResponse,
    );
    await expect(
      coordinator.receive(message(), async () => {
        throw new Error("duplicate must not execute");
      }),
    ).resolves.toMatchObject({
      response: GATEWAY_DELIVERY_PENDING_RESPONSE,
      duplicate: true,
      deliveryStatus: "rejected",
    });
  });

  it("does not cache a session initialization failure", async () => {
    const durableStore = store();
    const coordinator = new GatewayReceiveIdempotencyCoordinator(durableStore);
    const execute = vi
      .fn<() => Promise<GatewayReceiveOutcome>>()
      .mockRejectedValueOnce(new Error("session initialization failed"))
      .mockResolvedValueOnce({
        ok: true,
        response: "session recovered",
        agentCompleted: true,
      });

    await expect(coordinator.receive(message(), execute)).rejects.toThrow(
      "session initialization failed",
    );
    await expect(
      coordinator.receive(message(), execute),
    ).resolves.toMatchObject({
      ok: true,
      response: "session recovered",
    });
    expect(execute).toHaveBeenCalledTimes(2);
  });
});

import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type {
  PlatformAdapter,
  PlatformCapabilitySet,
} from "@/gateway/platforms/base";
import { GATEWAY_DUPLICATE_ACK_RESPONSE } from "@/gateway/receive/idempotency";
import type { GatewayReceiveResult } from "@/gateway/receive/index";
import type { GatewayRunnerContext } from "@/gateway/runner/context";
import { createGatewayRunnerOperations } from "@/gateway/runner/operations";
import { RunControllerService } from "@/services/run-controller-service";
import type {
  DeliveredMessageRecord,
  IncomingPlatformMessage,
  OutboundPlatformMessage,
  PlatformName,
  SessionRoute,
} from "@/types/gateway";

const { executeAgentTurnWithProgress } = vi.hoisted(() => ({
  executeAgentTurnWithProgress: vi.fn(async () => ({
    response: "executed after transport recovery",
  })),
}));

vi.mock("@/runtime/turn-stream", () => ({ executeAgentTurnWithProgress }));

type GatewayRunnerContextLike = {
  config: { gatewayDataDir: string; workspaceDir: string };
  services: {
    runController: RunControllerService;
    pairing: {
      isAllowed: () => boolean;
    };
    media: {
      speak: (...args: unknown[]) => Promise<{
        artifactPath: string;
        artifactKind: string;
      }>;
    };
    gatewaySessions: {
      list: () => SessionRoute[];
      resolve: (route: string) => SessionRoute;
    };
    delivery: {
      get: (
        deliveryId: string,
      ) =>
        | DeliveredMessageRecord
        | Promise<DeliveredMessageRecord | undefined>
        | undefined;
      update: (
        deliveryId: string,
        text: string,
        options?: {
          metadata?: Record<string, string>;
          threadId?: string;
          replyToId?: string;
        },
      ) => DeliveredMessageRecord | Promise<DeliveredMessageRecord>;
      recent: (options?: {
        limit?: number;
      }) => Promise<DeliveredMessageRecord[]>;
      deliver: (
        target: DeliveredMessageRecord["target"],
        text: string,
        extras?: { metadata?: Record<string, string> },
      ) => DeliveredMessageRecord | Promise<DeliveredMessageRecord>;
    };
    hooks: {
      emit: (...args: unknown[]) => Promise<void> | void;
    };
  };
  runtime: {
    logger?: {
      warn: (...args: unknown[]) => void;
    };
  };
};

type GatewayRunnerOperationsDeps = Parameters<
  typeof createGatewayRunnerOperations
>[0];

type TraceRecord = {
  kind: string;
  detail: string;
};

type TraceSink = {
  traces: TraceRecord[];
  inboxStatuses: Array<{
    platform: PlatformName;
    status: string;
    message: IncomingPlatformMessage;
  }>;
  outbox: DeliveredMessageRecord[];
};

const fullCapabilities: PlatformCapabilitySet = {
  inbound: true,
  outbound: true,
  edits: false,
  pairing: false,
  attachments: false,
  replies: true,
  threads: true,
  metadata: false,
};

type DeliveryUpdate = NonNullable<
  GatewayRunnerContextLike["services"]["delivery"]["update"]
>;
type DeliveryDeliver = NonNullable<
  GatewayRunnerContextLike["services"]["delivery"]["deliver"]
>;

function createRecording(sink: TraceSink) {
  const receiveOutcomes = new Map<string, GatewayReceiveResult>();
  return {
    recordInbox(
      message: IncomingPlatformMessage,
      _traceId: string,
      _sessionId?: string,
      status = "accepted",
    ) {
      sink.inboxStatuses.push({
        platform: message.platform,
        status,
        message,
      });
      return {
        recordId: randomUUID(),
        at: new Date().toISOString(),
        platform: message.platform,
        status,
      };
    },
    recordOutbox(
      platform: PlatformName,
      _traceId: string,
      _sessionId: string | undefined,
      delivery: DeliveredMessageRecord | undefined,
      _message: OutboundPlatformMessage,
      status: string,
    ) {
      if (delivery) sink.outbox.push(delivery);
      return {
        recordId: randomUUID(),
        at: new Date().toISOString(),
        platform,
        status,
        deliveryId: delivery?.id,
      };
    },
    recordReceiveOutcome(
      _message: IncomingPlatformMessage,
      idempotencyKey: string,
      outcome: GatewayReceiveResult,
    ) {
      receiveOutcomes.set(idempotencyKey, outcome);
      return { recordId: randomUUID() };
    },
    findReceiveOutcome(idempotencyKey: string) {
      return receiveOutcomes.get(idempotencyKey);
    },
    getOutboxRecord() {
      return undefined;
    },
    getSuccessfulOutboxRetry() {
      return undefined;
    },
    pushTrace(entry: { kind: string; platform: PlatformName; detail: string }) {
      sink.traces.push({
        kind: entry.kind,
        detail: entry.detail,
      });
    },
    snapshotState: async () => ({ state: {} }),
    observeAdapter: async (_platform: PlatformName) => {},
    editDelivery: async () => {
      throw new Error(
        "editDelivery should be delegated by outbound flow logic",
      );
    },
    getOutboxSessionIdByDeliveryId() {
      return "session-1";
    },
  } as const;
}

function createContext(overrides: {
  sessions?: SessionRoute[];
  canReceive?: boolean;
  deliveryGet?: (
    deliveryId: string,
  ) =>
    | DeliveredMessageRecord
    | Promise<DeliveredMessageRecord | undefined>
    | undefined;
  deliveryUpdate?: (
    deliveryId: string,
    text: string,
    options?: {
      metadata?: Record<string, string>;
      threadId?: string;
      replyToId?: string;
    },
  ) => DeliveredMessageRecord | Promise<DeliveredMessageRecord>;
  runtimeLogger?: GatewayRunnerContextLike["runtime"]["logger"];
}): GatewayRunnerContext {
  return {
    config: {
      gatewayDataDir: "/tmp/gateway-runner-ops",
      workspaceDir: "/workspace/active",
    },
    services: {
      runController: new RunControllerService(),
      pairing: {
        isAllowed: () => true,
      },
      media: {
        speak: async () => ({ artifactPath: "", artifactKind: "mp3" }),
      },
      gatewaySessions: {
        list: () => overrides.sessions ?? [],
        resolve: () => {
          const match = overrides.sessions?.[0];
          return {
            sessionKey: match?.sessionKey ?? "session-home",
            roomId: match?.roomId ?? "room-home",
            platform: match?.platform ?? "api",
            userId: match?.userId ?? "user-home",
            isHome: true,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          } as SessionRoute;
        },
      },
      delivery: {
        get: overrides.deliveryGet ?? (() => undefined),
        update: (async (
          deliveryId: string,
          text: string,
          options?: {
            metadata?: Record<string, string>;
            threadId?: string;
            replyToId?: string;
          },
        ) => {
          const update = overrides.deliveryUpdate;
          if (!update) {
            throw new Error("delivery.update test double not configured");
          }
          return Promise.resolve(update(deliveryId, text, options));
        }) satisfies DeliveryUpdate,
        recent: () => Promise.resolve([]),
        deliver: (
          _target: Parameters<DeliveryDeliver>[0],
          text: string,
          _options?: Parameters<DeliveryDeliver>[2],
        ) => {
          return {
            id: randomUUID(),
            target: {
              platform: "api",
              roomId: "room-home",
              userId: "user-home",
              mode: "home",
            },
            text,
            createdAt: new Date().toISOString(),
          } as DeliveredMessageRecord;
        },
      },
      hooks: {
        emit: async () => {},
      },
    },
    runtime: { logger: overrides.runtimeLogger },
  } as unknown as GatewayRunnerContext;
}

function createAdapter(overrides: {
  canReceive: boolean;
  send?: (message: OutboundPlatformMessage) => Promise<DeliveredMessageRecord>;
  edit?: (
    delivery: DeliveredMessageRecord,
    outbound: OutboundPlatformMessage,
  ) => Promise<DeliveredMessageRecord>;
}): PlatformAdapter {
  return {
    name: "api",
    async start() {},
    async stop() {},
    async health() {
      return {
        platform: "api",
        status: "running",
        ready: true,
        mode: "mock",
        capabilities: {
          ...fullCapabilities,
        },
        detail: "api",
        events: [],
      };
    },
    canReceive: () => overrides.canReceive,
    send:
      overrides.send ??
      (async (message) => {
        return {
          id: randomUUID(),
          target: {
            platform: "api",
            roomId: message.roomId,
            userId: message.userId,
            mode: "home",
          },
          text: message.text,
          createdAt: new Date().toISOString(),
        } as DeliveredMessageRecord;
      }),
    edit: overrides.edit,
  };
}

describe("createGatewayRunnerOperations", () => {
  it("retries the same upstream message after receive transport recovers", async () => {
    const sink: TraceSink = {
      traces: [],
      inboxStatuses: [],
      outbox: [],
    };

    let canReceive = false;
    const adapter = createAdapter({
      canReceive: false,
      edit: async (delivery, outbound) => ({
        ...delivery,
        text: outbound.text,
      }),
    });
    adapter.canReceive = () => canReceive;
    const recording = createRecording(sink);
    const recordReceiveOutcome = vi.spyOn(recording, "recordReceiveOutcome");
    executeAgentTurnWithProgress.mockClear();
    const operations = createGatewayRunnerOperations({
      context: createContext({
        canReceive: false,
        deliveryGet: (deliveryId) => ({
          id: deliveryId,
          target: {
            platform: "api",
            roomId: "room-home",
            userId: "user-home",
            mode: "explicit",
          },
          text: "executed after transport recovery",
          createdAt: "2026-08-15T00:00:00.000Z",
        }),
      }),
      adapters: new Map([["api", adapter]]),
      recording:
        recording as unknown as GatewayRunnerOperationsDeps["recording"],
      snapshotState: async () => ({ state: {} }),
      observeAdapter: async () => {},
      getOutboxSessionIdByDeliveryId: () => "session-home",
    });

    const result: GatewayReceiveResult = await operations.receive({
      platform: "api",
      userId: "user-home",
      roomId: "room-home",
      text: "hey",
      messageId: "msg-home",
    });

    expect(result.ok).toBe(false);
    expect(result.response).toContain("not ready for inbound traffic");
    expect(sink.inboxStatuses).toHaveLength(1);
    expect(sink.inboxStatuses[0]?.status).toBe("rejected");
    expect(sink.traces).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "reject" })]),
    );
    expect(recordReceiveOutcome).not.toHaveBeenCalled();

    canReceive = true;
    const recovered = await operations.receive({
      platform: "api",
      userId: "user-home",
      roomId: "room-home",
      text: "hey",
      messageId: "msg-home",
    });

    expect(recovered).toMatchObject({
      agentCompleted: true,
      deliveryStatus: "sent",
      response: "executed after transport recovery",
    });
    expect(executeAgentTurnWithProgress).toHaveBeenCalledTimes(1);
    expect(recordReceiveOutcome).toHaveBeenCalledTimes(1);

    await expect(
      operations.receive({
        platform: "api",
        userId: "user-home",
        roomId: "room-home",
        text: "hey",
        messageId: "msg-home",
      }),
    ).resolves.toMatchObject({
      duplicate: true,
      response: GATEWAY_DUPLICATE_ACK_RESPONSE,
    });
    expect(executeAgentTurnWithProgress).toHaveBeenCalledTimes(1);
  });

  it("sendToHomes sends each enabled home session through adapter", async () => {
    const sink: TraceSink = {
      traces: [],
      inboxStatuses: [],
      outbox: [],
    };

    const operations = createGatewayRunnerOperations({
      context: createContext({
        sessions: [
          {
            sessionKey: "session-home",
            roomId: "room-home",
            userId: "user-home",
            platform: "api",
            isHome: true,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
      adapters: new Map([
        [
          "api",
          createAdapter({
            canReceive: true,
            send: async (message) => {
              return {
                id: randomUUID(),
                target: {
                  platform: "api",
                  roomId: message.roomId,
                  userId: message.userId,
                  mode: "home",
                },
                text: message.text,
                createdAt: new Date().toISOString(),
              };
            },
          }),
        ],
      ]),
      recording: createRecording(
        sink,
      ) as unknown as GatewayRunnerOperationsDeps["recording"],
      snapshotState: async () => ({ state: {} }),
      observeAdapter: async () => {},
      getOutboxSessionIdByDeliveryId: () => "session-home",
    });

    const deliveries = await operations.sendToHomes("hello world", {
      platforms: ["api"],
      metadata: {
        source: "tests",
      },
    });

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({ text: "hello world" });
    expect(sink.outbox).toHaveLength(1);
    expect(sink.traces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "deliver",
          detail: expect.stringContaining("home"),
        }),
      ]),
    );
  });

  it("falls back to delivery.update when adapter edit is unavailable", async () => {
    const sink: TraceSink = {
      traces: [],
      inboxStatuses: [],
      outbox: [],
    };
    let updatedText = "first";

    const operations = createGatewayRunnerOperations({
      context: createContext({
        deliveryGet: () => {
          return {
            id: "delivery-root",
            target: {
              platform: "api",
              roomId: "room-home",
              userId: "user-home",
              mode: "explicit",
            },
            text: "first",
            createdAt: "2026-01-01T00:00:00.000Z",
          };
        },
        deliveryUpdate: (_deliveryId, text) => {
          updatedText = text;
          return {
            id: "delivery-root",
            target: {
              platform: "api",
              roomId: "room-home",
              userId: "user-home",
              mode: "explicit",
            },
            text,
            createdAt: "2026-01-01T00:00:00.000Z",
          };
        },
      }),
      adapters: new Map(),
      recording: createRecording(
        sink,
      ) as unknown as GatewayRunnerOperationsDeps["recording"],
      snapshotState: async () => ({ state: {} }),
      observeAdapter: async () => {},
      getOutboxSessionIdByDeliveryId: () => "session-home",
    });

    const edited = await operations.editDelivery(
      "delivery-root",
      "updated text",
    );

    expect(edited.text).toBe("updated text");
    expect(updatedText).toBe("updated text");
    expect(sink.traces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "update",
          detail: expect.stringContaining("Updated"),
        }),
      ]),
    );
  });

  it("streams progressive delivery by editing existing deliveries", async () => {
    const sink: TraceSink = {
      traces: [],
      inboxStatuses: [],
      outbox: [],
    };
    const edits: string[] = [];

    const adapter = createAdapter({
      canReceive: true,
      edit: async (delivery, outbound) => {
        edits.push(`${delivery.id}:${outbound.text}`);
        return {
          ...delivery,
          id: `${delivery.id}-edited`,
          text: outbound.text,
        } as DeliveredMessageRecord;
      },
    });

    const operations = createGatewayRunnerOperations({
      context: createContext({
        deliveryGet: () => ({
          id: "delivery-root",
          target: {
            platform: "api",
            roomId: "room-home",
            userId: "user-home",
            mode: "explicit",
          },
          text: "first",
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
      }),
      adapters: new Map([
        [
          "api",
          {
            ...adapter,
            send: async (message) => {
              return {
                id: "delivery-root",
                target: {
                  platform: "api",
                  roomId: message.roomId,
                  userId: message.userId,
                  mode: "explicit",
                },
                text: message.text,
                createdAt: new Date().toISOString(),
              };
            },
          },
        ],
      ]),
      recording: createRecording(
        sink,
      ) as unknown as GatewayRunnerOperationsDeps["recording"],
      snapshotState: async () => ({ state: {} }),
      observeAdapter: async () => {},
      getOutboxSessionIdByDeliveryId: () => "session-home",
    });

    const finalDelivery = await operations.sendProgressive(
      {
        platform: "api",
        roomId: "room-home",
        userId: "user-home",
      },
      ["first", "second", "third"],
    );

    expect(finalDelivery.text).toBe("third");
    expect(edits).toHaveLength(2);
    expect(edits).toEqual(["delivery-root:second", "delivery-root:third"]);
    expect(sink.outbox).toHaveLength(3);
  });

  it("retries a rejected payload without invoking gateway receive execution", async () => {
    const sink: TraceSink = {
      traces: [],
      inboxStatuses: [],
      outbox: [],
    };
    const outbound: OutboundPlatformMessage = {
      roomId: "room-retry",
      userId: "user-retry",
      text: "already computed response",
      metadata: { correlation: "retry-1" },
    };
    const recording = {
      ...createRecording(sink),
      getOutboxRecord: (recordId: string) =>
        recordId === "outbox-rejected"
          ? {
              recordId,
              at: "2026-08-15T00:00:00.000Z",
              platform: "api" as const,
              sessionId: "session-retry",
              traceId: "trace-original",
              status: "rejected" as const,
              roomId: outbound.roomId,
              textPreview: outbound.text,
              attachmentCount: 0,
              attachmentKinds: [],
              attachmentNames: [],
              attachmentUrls: [],
              attachmentMimeTypes: [],
              metadataKeys: ["correlation"],
              metadata: outbound.metadata ?? {},
              outbound,
              notes: ["adapter unavailable"],
            }
          : undefined,
    };
    const send = vi.fn(async (message: OutboundPlatformMessage) => ({
      id: "delivery-retried",
      target: {
        platform: "api" as const,
        channelId: message.roomId,
        userId: message.userId,
        mode: "origin" as const,
      },
      text: message.text,
      metadata: message.metadata,
      createdAt: "2026-08-15T00:01:00.000Z",
    }));
    const snapshotState = vi.fn(async () => ({ state: {} }));
    const operations = createGatewayRunnerOperations({
      context: createContext({}),
      adapters: new Map([["api", createAdapter({ canReceive: true, send })]]),
      recording:
        recording as unknown as GatewayRunnerOperationsDeps["recording"],
      snapshotState,
      observeAdapter: async () => {},
      getOutboxSessionIdByDeliveryId: () => "session-retry",
    });

    const delivery = await operations.retryDelivery("outbox-rejected");

    expect(delivery.id).toBe("delivery-retried");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(outbound);
    expect(sink.inboxStatuses).toEqual([]);
    expect(snapshotState).toHaveBeenCalledWith("retry-delivery", 20);
    expect(sink.traces).toEqual([
      expect.objectContaining({
        kind: "deliver",
        detail: expect.stringContaining("outbox-rejected"),
      }),
    ]);
  });

  it("joins concurrent retries and reuses the persisted successful retry", async () => {
    const sink: TraceSink = { traces: [], inboxStatuses: [], outbox: [] };
    const outbound: OutboundPlatformMessage = {
      roomId: "room-retry",
      userId: "user-retry",
      text: "computed once",
    };
    const records: Array<Record<string, unknown>> = [];
    const delivery: DeliveredMessageRecord = {
      id: "delivery-retried",
      target: {
        platform: "api",
        channelId: outbound.roomId,
        userId: outbound.userId,
        mode: "origin",
      },
      text: outbound.text,
      createdAt: "2026-08-15T00:01:00.000Z",
    };
    let releaseSend!: () => void;
    const sendBarrier = new Promise<void>((resolve) => {
      releaseSend = resolve;
    });
    const send = vi.fn(async () => {
      await sendBarrier;
      return delivery;
    });
    const baseRecording = createRecording(sink);
    const recording = {
      ...baseRecording,
      getOutboxRecord: (recordId: string) =>
        recordId === "outbox-rejected"
          ? {
              recordId,
              platform: "api" as const,
              sessionId: "session-retry",
              status: "rejected" as const,
              outbound,
            }
          : undefined,
      getSuccessfulOutboxRetry: (recordId: string) =>
        records.find(
          (record) =>
            record.retryOfRecordId === recordId && record.status === "sent",
        ),
      recordOutbox: (
        platform: PlatformName,
        _traceId: string,
        _sessionId: string | undefined,
        retriedDelivery: DeliveredMessageRecord | undefined,
        _message: OutboundPlatformMessage,
        status: string,
        _notes?: string[],
        _attemptedDeliveryId?: string,
        retryOfRecordId?: string,
      ) => {
        const record = {
          recordId: `record-${records.length + 1}`,
          platform,
          status,
          deliveryId: retriedDelivery?.id,
          retryOfRecordId,
        };
        records.push(record);
        return record;
      },
    };
    const operations = createGatewayRunnerOperations({
      context: createContext({
        deliveryGet: (deliveryId) =>
          deliveryId === delivery.id ? delivery : undefined,
      }),
      adapters: new Map([["api", createAdapter({ canReceive: true, send })]]),
      recording:
        recording as unknown as GatewayRunnerOperationsDeps["recording"],
      snapshotState: async () => ({ state: {} }),
      observeAdapter: async () => {},
      getOutboxSessionIdByDeliveryId: () => "session-retry",
    });

    const first = operations.retryDelivery("outbox-rejected");
    const concurrent = operations.retryDelivery("outbox-rejected");
    releaseSend();
    await expect(Promise.all([first, concurrent])).resolves.toEqual([
      delivery,
      delivery,
    ]);
    await expect(operations.retryDelivery("outbox-rejected")).resolves.toEqual(
      delivery,
    );
    expect(send).toHaveBeenCalledTimes(1);
    expect(records).toEqual([
      expect.objectContaining({
        status: "sent",
        deliveryId: "delivery-retried",
        retryOfRecordId: "outbox-rejected",
      }),
    ]);
  });

  it("keeps a successful retry truthful when observation and snapshot side effects fail", async () => {
    const sink: TraceSink = { traces: [], inboxStatuses: [], outbox: [] };
    const outbound: OutboundPlatformMessage = {
      roomId: "room-retry",
      userId: "user-retry",
      text: "computed response",
    };
    const delivery: DeliveredMessageRecord = {
      id: "delivery-retried",
      target: {
        platform: "api",
        channelId: outbound.roomId,
        userId: outbound.userId,
        mode: "origin",
      },
      text: outbound.text,
      createdAt: "2026-08-15T00:01:00.000Z",
    };
    const retryRecords: Array<{
      status: string;
      retryOfRecordId?: string;
    }> = [];
    const recording = {
      ...createRecording(sink),
      getOutboxRecord: (recordId: string) =>
        recordId === "outbox-rejected"
          ? {
              recordId,
              platform: "api" as const,
              sessionId: "session-retry",
              status: "rejected" as const,
              outbound,
            }
          : undefined,
      recordOutbox: (
        _platform: PlatformName,
        _traceId: string,
        _sessionId: string | undefined,
        _retriedDelivery: DeliveredMessageRecord | undefined,
        _message: OutboundPlatformMessage,
        status: string,
        _notes?: string[],
        _attemptedDeliveryId?: string,
        retryOfRecordId?: string,
      ) => {
        const record = {
          recordId: `record-${retryRecords.length + 1}`,
          platform: "api" as const,
          status,
          retryOfRecordId,
        };
        retryRecords.push(record);
        return record;
      },
    };
    const warn = vi.fn();
    const send = vi.fn(async () => delivery);
    const operations = createGatewayRunnerOperations({
      context: createContext({ runtimeLogger: { warn } }),
      adapters: new Map([["api", createAdapter({ canReceive: true, send })]]),
      recording:
        recording as unknown as GatewayRunnerOperationsDeps["recording"],
      observeAdapter: async () => {
        throw new Error("Authorization: Bearer secret-observe-token");
      },
      snapshotState: async () => {
        throw new Error("api_key=secret-snapshot-key");
      },
      getOutboxSessionIdByDeliveryId: () => "session-retry",
    });

    await expect(operations.retryDelivery("outbox-rejected")).resolves.toEqual(
      delivery,
    );

    expect(send).toHaveBeenCalledTimes(1);
    expect(retryRecords).toHaveLength(1);
    expect(retryRecords).toEqual([
      expect.objectContaining({
        status: "sent",
        retryOfRecordId: "outbox-rejected",
      }),
    ]);
    expect(retryRecords).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ status: "rejected" })]),
    );
    expect(warn).toHaveBeenCalledTimes(2);
    const warnings = JSON.stringify(warn.mock.calls);
    expect(warnings).toContain("retry-delivery:observe");
    expect(warnings).toContain("retry-delivery:snapshot");
    expect(warnings).not.toContain("secret-observe-token");
    expect(warnings).not.toContain("secret-snapshot-key");
  });
});

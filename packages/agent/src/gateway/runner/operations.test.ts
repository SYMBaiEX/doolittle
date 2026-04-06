import { describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import type {
  PlatformAdapter,
  PlatformCapabilitySet,
} from "@/gateway/platforms/base";
import type { GatewayReceiveResult } from "@/gateway/receive/index";
import type { GatewayRunnerContext } from "@/gateway/runner/context";
import { createGatewayRunnerOperations } from "@/gateway/runner/operations";
import type {
  DeliveredMessageRecord,
  IncomingPlatformMessage,
  OutboundPlatformMessage,
  PlatformName,
  SessionRoute,
} from "@/types/gateway";

type GatewayRunnerContextLike = {
  config: { gatewayDataDir: string };
  services: {
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
  runtime: Record<string, never>;
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
      _platform: PlatformName,
      _traceId: string,
      _sessionId: string | undefined,
      delivery: DeliveredMessageRecord,
      _message: OutboundPlatformMessage,
      _status: string,
    ) {
      sink.outbox.push(delivery);
      return {
        recordId: randomUUID(),
        at: new Date().toISOString(),
        platform: delivery.target.platform,
        status: "sent",
        deliveryId: delivery.id,
      };
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
}): GatewayRunnerContext {
  return {
    config: { gatewayDataDir: "/tmp/gateway-runner-ops" },
    services: {
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
    runtime: {} as Record<string, never>,
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
  it("returns reject result when receive transport cannot accept inbound traffic", async () => {
    const sink: TraceSink = {
      traces: [],
      inboxStatuses: [],
      outbox: [],
    };

    const operations = createGatewayRunnerOperations({
      context: createContext({ canReceive: false }),
      adapters: new Map([["api", createAdapter({ canReceive: false })]]),
      recording: createRecording(
        sink,
      ) as unknown as GatewayRunnerOperationsDeps["recording"],
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

    expect(result.ok).toBeFalse();
    expect(result.response).toContain("not ready for inbound traffic");
    expect(sink.inboxStatuses).toHaveLength(1);
    expect(sink.inboxStatuses[0]?.status).toBe("rejected");
    expect(sink.traces).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "reject" })]),
    );
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
});

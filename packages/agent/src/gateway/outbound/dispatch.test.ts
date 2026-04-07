import { describe, expect, it } from "bun:test";
import type {
  DeliveredMessageRecord,
  PlatformName,
  SessionRoute,
} from "@/types/gateway";
import type { PlatformAdapter } from "../platforms/base";
import type {
  GatewayOutboxRecord,
  GatewayTraceRecord,
} from "../read/history-view";
import {
  editDeliveryOutbound,
  sendProgressiveOutbound,
  sendToHomesOutbound,
} from "./dispatch";

const platformHealth = {
  platform: "api" as const,
  status: "running" as const,
  ready: true,
  mode: "native" as const,
  capabilities: {
    inbound: true,
    outbound: true,
    edits: true,
    pairing: true,
    attachments: false,
    replies: true,
    threads: true,
    metadata: true,
  },
  detail: "ok",
  events: [],
};

describe("gateway outbound dispatch", () => {
  it("sends home deliveries via adapter and fallback", async () => {
    const sessions: SessionRoute[] = [
      {
        sessionKey: "home-session-api",
        platform: "api",
        isHome: true,
        roomId: "room-api",
        userId: "user-api",
        threadId: "thread-api",
        replyToMessageId: "reply-api",
        createdAt: "2026-03-30T00:00:00.000Z",
        updatedAt: "2026-03-30T00:00:00.000Z",
      },
      {
        sessionKey: "home-session-cli",
        platform: "cli",
        isHome: true,
        roomId: "room-cli",
        userId: "user-cli",
        createdAt: "2026-03-30T00:00:00.000Z",
        updatedAt: "2026-03-30T00:00:00.000Z",
      },
      {
        sessionKey: "non-home",
        platform: "discord",
        isHome: false,
        roomId: "room-discord",
        userId: "user-discord",
        createdAt: "2026-03-30T00:00:00.000Z",
        updatedAt: "2026-03-30T00:00:00.000Z",
      },
    ];
    const adapter: PlatformAdapter = {
      name: "api",
      async send() {
        return {
          id: "delivery-api",
          target: {
            platform: "api",
            channelId: "room-api",
            userId: "user-api",
            mode: "home",
          },
          text: "agent says hello",
          threadId: "thread-api",
          replyToId: "reply-api",
          metadata: { audioAsVoice: "true" },
          createdAt: "2026-03-30T00:00:01.000Z",
        };
      },
      async stop() {},
      async start() {},
      async health() {
        return platformHealth;
      },
      canReceive() {
        return true;
      },
    };
    const outbox: Array<{
      platform: PlatformName;
      status: GatewayOutboxRecord["status"];
    }> = [];
    const traces: GatewayTraceRecord[] = [];
    let platformsFilter: ReadonlySet<PlatformName> | null | undefined;

    const result = await sendToHomesOutbound(
      "agent says hello",
      { metadata: { source: "unit" }, platforms: ["api", "cli"] },
      {
        listHomeSessions: (platforms) => {
          platformsFilter = platforms;
          return sessions.filter(
            (entry) =>
              entry.isHome &&
              (!platforms || platforms.has(entry.platform)) &&
              (entry.channelId ?? entry.roomId),
          );
        },
        buildOutboundForSession: async (session, outbound, speechName) => {
          expect(speechName).toBe("home-delivery");
          return {
            ...outbound,
            metadata: {
              ...(outbound.metadata ?? {}),
              wrapped: session.platform,
            },
          };
        },
        getAdapter: (platform) => (platform === "api" ? adapter : undefined),
        fallbackDeliver: (target, text, extras) => {
          expect(target.platform).toBe("cli");
          expect(target.mode).toBe("home");
          return {
            id: "delivery-fallback",
            target: {
              platform: "cli",
              channelId: target.channelId,
              userId: target.userId,
              mode: "home",
            },
            text,
            threadId: extras?.threadId,
            replyToId: extras?.replyToId,
            metadata: extras?.metadata,
            createdAt: "2026-03-30T00:00:02.000Z",
          };
        },
        recordOutbox: (
          _platform,
          _traceId,
          _sessionId,
          _delivery,
          _message,
          status,
        ) => {
          outbox.push({ platform: _platform, status });
        },
        pushTrace: (entry) => traces.push(entry),
      },
    );

    expect(platformsFilter?.has("api")).toBe(true);
    expect(platformsFilter?.has("cli")).toBe(true);
    expect(platformsFilter?.has("discord")).toBe(false);
    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe("delivery-api");
    expect(result[1]?.id).toBe("delivery-fallback");
    expect(outbox).toEqual([
      { platform: "api", status: "sent" },
      { platform: "cli", status: "fallback" },
    ]);
    expect(traces).toHaveLength(2);
    expect(traces.at(0)?.kind).toBe("deliver");
    expect(traces.at(1)?.kind).toBe("deliver");
  });

  it("edits an existing delivery with platform adapter", async () => {
    const outboxStatus: GatewayOutboxRecord["status"][] = [];
    const traces: GatewayTraceRecord[] = [];
    const lifecycleKinds: string[] = [];
    let snapshotCalls = 0;
    const adapter: PlatformAdapter = {
      name: "api",
      async edit(delivery, message) {
        expect(delivery.id).toBe("delivery-api");
        return {
          ...delivery,
          text: message.text,
          metadata: {
            ...(delivery.metadata ?? {}),
            ...(message.metadata ?? {}),
            editedLocally: "true",
          },
          updatedAt: "2026-03-30T00:00:03.000Z",
          editOfId: delivery.id,
          editCount: 1,
        };
      },
      async stop() {},
      async start() {},
      async health() {
        return platformHealth;
      },
      canReceive() {
        return true;
      },
      async send() {
        return {
          id: "delivery-api",
          target: {
            platform: "api",
            channelId: "room-api",
            userId: "user-api",
            mode: "home",
          },
          text: "no-op",
          createdAt: "2026-03-30T00:00:01.000Z",
        };
      },
    };

    const updated = await editDeliveryOutbound(
      "delivery-api",
      "rephrased reply",
      { metadata: { revision: "2" } },
      {
        getDelivery: (id) =>
          ({
            id,
            target: {
              platform: "api",
              channelId: "room-api",
              userId: "user-api",
              mode: "home",
            },
            text: "original",
            threadId: "thread-api",
            replyToId: "reply-api",
            metadata: { source: "gateway" },
            createdAt: "2026-03-30T00:00:01.000Z",
          }) as DeliveredMessageRecord,
        getOutboxSessionIdByDeliveryId: () => "session-api",
        getAdapter: () => adapter,
        buildOutboundFromDelivery: (delivery, text, options) => ({
          roomId: delivery.target.channelId ?? delivery.target.userId ?? "room",
          userId: delivery.target.userId,
          text,
          threadId: options?.threadId ?? delivery.threadId,
          replyToId: options?.replyToId ?? delivery.replyToId,
          metadata: {
            ...(delivery.metadata ?? {}),
            ...(options?.metadata ?? {}),
          },
        }),
        fallbackUpdate: async () => {
          throw new Error("fallback should not be called");
        },
        recordOutbox: (
          _platform,
          _traceId,
          sessionId,
          _delivery,
          _message,
          status,
        ) => {
          expect(sessionId).toBe("session-api");
          outboxStatus.push(status);
        },
        pushTrace: (entry) => traces.push(entry),
        observeAdapter: async (_platform, event) => {
          lifecycleKinds.push(event.kind);
        },
        snapshotState: async () => {
          snapshotCalls += 1;
        },
      },
    );

    expect(updated.text).toBe("rephrased reply");
    expect(updated.metadata?.editedLocally).toBe("true");
    expect(outboxStatus).toEqual(["edited"]);
    expect(lifecycleKinds).toEqual(["edit"]);
    expect(snapshotCalls).toBe(1);
    expect(traces.at(0)?.kind).toBe("update");
    expect(traces.at(0)?.platform).toBe("api");
  });

  it("throws when editing an unknown delivery id", async () => {
    const edit = async () =>
      editDeliveryOutbound("missing", "text", undefined, {
        getDelivery: () => undefined,
        getOutboxSessionIdByDeliveryId: () => undefined,
        getAdapter: () => undefined,
        buildOutboundFromDelivery: () => {
          throw new Error("not expected");
        },
        fallbackUpdate: async () => {
          throw new Error("not expected");
        },
        recordOutbox: () => {},
        pushTrace: () => {},
        observeAdapter: async () => {},
        snapshotState: async () => {},
      });

    await expect(edit()).rejects.toThrow("Delivery missing was not found.");
  });

  it("throws when progressive delivery has no valid parts", async () => {
    const send = sendProgressiveOutbound(
      {
        platform: "api",
        roomId: "room-api",
      },
      [" ", "\n", ""],
      {
        getAdapter: () => undefined,
        fallbackDeliver: () => {
          throw new Error("should not be reached");
        },
        recordOutbox: () => {},
        pushTrace: () => {},
        editDelivery: async () => {
          throw new Error("should not be reached");
        },
      },
    );
    await expect(send).rejects.toThrow(
      "Progressive delivery requires at least one message part.",
    );
  });

  it("falls back for progressive delivery when no adapter exists", async () => {
    const outbox: Array<"sent" | "fallback" | "edited" | "rejected"> = [];
    const traces: GatewayTraceRecord[] = [];

    const result = await sendProgressiveOutbound(
      {
        platform: "api",
        roomId: "room-api",
        userId: "user-api",
      },
      ["only one"],
      {
        getAdapter: () => undefined,
        fallbackDeliver: (target, text, extras) => {
          expect(target.platform).toBe("api");
          expect(target.mode).toBe("explicit");
          return {
            id: "delivery-progressive-fallback",
            target: {
              platform: "api",
              channelId: target.channelId,
              userId: target.userId,
              mode: "explicit",
            },
            text,
            metadata: extras?.metadata,
            createdAt: "2026-03-30T00:00:01.000Z",
          };
        },
        recordOutbox: (
          _platform,
          _traceId,
          _sessionId,
          _delivery,
          _message,
          status,
        ) => {
          outbox.push(status);
        },
        pushTrace: (entry) => traces.push(entry),
        editDelivery: async () => {
          throw new Error("edit should not be called");
        },
      },
    );

    expect(result.id).toBe("delivery-progressive-fallback");
    expect(outbox).toEqual(["fallback"]);
    expect(traces).toHaveLength(1);
    expect(traces.at(0)?.kind).toBe("deliver");
  });

  it("sends progressive outbound then chains edits", async () => {
    const adapter: PlatformAdapter = {
      name: "api",
      async send(message) {
        return {
          id: "delivery-progressive",
          target: {
            platform: "api",
            channelId: message.roomId,
            userId: message.userId,
            mode: "explicit",
          },
          text: message.text,
          threadId: message.threadId,
          replyToId: message.replyToId,
          metadata: message.metadata,
          createdAt: "2026-03-30T00:00:01.000Z",
        };
      },
      async stop() {},
      async start() {},
      async health() {
        return platformHealth;
      },
      canReceive() {
        return true;
      },
    };
    const outbox: Array<"sent" | "fallback" | "edited" | "rejected"> = [];
    const traces: GatewayTraceRecord[] = [];
    const edits: DeliveredMessageRecord[] = [];

    const result = await sendProgressiveOutbound(
      {
        platform: "api",
        roomId: "room-api",
        userId: "user-api",
        threadId: "thread-api",
        replyToId: "reply-api",
        metadata: { source: "agent" },
      },
      ["hello", "follow-up", "complete"],
      {
        getAdapter: () => adapter,
        fallbackDeliver: () => {
          throw new Error("adapter path should be used");
        },
        recordOutbox: (
          _platform,
          _traceId,
          _sessionId,
          _delivery,
          _message,
          status,
        ) => {
          outbox.push(status);
        },
        pushTrace: (entry) => traces.push(entry),
        editDelivery: async (_deliveryId, text, _options) => {
          edits.push({
            id: `delivery-progressive-edited-${edits.length + 1}`,
            target: {
              platform: "api",
              channelId: "room-api",
              userId: "user-api",
              mode: "explicit",
            },
            text,
            threadId: "thread-api",
            replyToId: "reply-api",
            metadata: {
              progressive: "true",
              progressiveStep: "2",
              progressiveTotal: "3",
            },
            createdAt: "2026-03-30T00:00:02.000Z",
            updatedAt: "2026-03-30T00:00:03.000Z",
          });
          return edits[edits.length - 1];
        },
      },
    );

    expect(result.text).toBe("complete");
    expect(edits).toHaveLength(2);
    expect(edits.map((delivery) => delivery.text)).toEqual([
      "follow-up",
      "complete",
    ]);
    expect(outbox).toEqual(["sent"]);
    expect(traces[0]?.kind).toBe("deliver");
    expect(traces).toHaveLength(1);
  });
});

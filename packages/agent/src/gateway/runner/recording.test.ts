import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  GatewayAttachmentRecord,
  GatewayInboxRecord,
  GatewayOutboxRecord,
  GatewayTraceRecord,
} from "@/gateway/read/history-view";
import type { GatewayRuntimeStatus } from "@/gateway/read/read-model";
import { GatewayRunnerRecording } from "@/gateway/runner/recording";
import { createGatewayPlatformState } from "@/gateway/state/platform-state";
import type { GatewayPlatformStateView } from "@/gateway/state/state-snapshot";
import type { GatewaySupervisionRecord } from "@/gateway/supervision/index";

describe("GatewayRunnerRecording", () => {
  it("records journals, updates platform state, and emits update events", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-gateway-recording-"));
    const platformStates = new Map<string, GatewayPlatformStateView>();
    const traceLog: GatewayTraceRecord[] = [];
    const inboxLog: GatewayInboxRecord[] = [];
    const outboxLog: GatewayOutboxRecord[] = [];
    const attachmentLog: GatewayAttachmentRecord[] = [];
    const supervisionLog: GatewaySupervisionRecord[] = [];
    const inboxPath = join(root, "gateway-inbox.jsonl");
    const outboxPath = join(root, "gateway-outbox.jsonl");
    const attachmentsPath = join(root, "gateway-attachments.jsonl");
    const supervisionPath = join(root, "gateway-supervision.jsonl");
    const runtimeStatusPath = join(root, "gateway-runtime.json");
    const events: Array<{
      kind: GatewayTraceRecord["kind"];
      platform: GatewayTraceRecord["platform"];
      detail: string;
    }> = [];

    const ensurePlatformState = (platform: string) => {
      const existing = platformStates.get(platform);
      if (existing) {
        return existing;
      }
      const created = createGatewayPlatformState(
        platform as "api",
      ) as GatewayPlatformStateView;
      platformStates.set(platform, created);
      return created;
    };
    const getRuntimeStatus = (): GatewayRuntimeStatus => ({
      pid: 123,
      running: true,
      updatedAt: "2026-03-30T00:00:00.000Z",
      supervisionEvents: supervisionLog.length,
      adapters: ["api"],
      daemon: {
        policy: {
          heartbeatIntervalMs: 30_000,
          watchdogIntervalMs: 120_000,
          restartBaseDelayMs: 5_000,
          restartMaxDelayMs: 60_000,
          restartMultiplier: 2,
          restartJitterMs: 750,
        },
        state: {
          heartbeatRuns: 1,
          watchdogRuns: 1,
          restartRuns: 0,
          restartRecoveries: 0,
          restartBackoffs: 0,
          watchdogSkips: 0,
        },
        watchdog: {
          running: true,
          activePlatforms: 1,
          unhealthyPlatforms: 0,
          restartablePlatforms: 1,
          backoffPlatforms: 0,
        },
        restartQueue: [],
      },
      journalPaths: {
        snapshot: join(root, "gateway-state.json"),
        history: join(root, "gateway-state-history.jsonl"),
        runtime: runtimeStatusPath,
        supervision: supervisionPath,
        inbox: inboxPath,
        outbox: outboxPath,
        attachments: attachmentsPath,
      },
      transportControl: {
        configured: 1,
        enabledPlugins: 1,
        gatewayEnabled: 1,
        availableServices: 1,
        liveServices: 1,
        officialPlugins: 0,
        vendoredPlugins: 0,
        operationalTransports: 1,
        customTransports: 1,
        productTransports: 0,
      },
      messagingBridge: [],
      transportInventory: [],
    });

    const recording = new GatewayRunnerRecording({
      traceLog,
      inboxLog,
      outboxLog,
      attachmentLog,
      supervisionLog,
      inboxPath,
      outboxPath,
      attachmentsPath,
      supervisionPath,
      runtimeStatusPath,
      ensurePlatformState: (platform) => ensurePlatformState(platform),
      updatePlatformStateFromTrace: (entry) => {
        if (entry.platform === "gateway") {
          return;
        }
        const state = ensurePlatformState(entry.platform);
        state.traceCount += 1;
        state.lastTraceAt = entry.at;
        state.lastTraceKind = entry.kind;
        state.lastTraceDetail = entry.detail;
      },
      getRuntimeStatus,
    });
    recording.onUpdate((event) => {
      events.push(event);
    });

    const inboxRecord = recording.recordInbox(
      {
        platform: "api",
        userId: "user-1",
        roomId: "room-1",
        text: "hello world",
        messageId: "msg-1",
        metadata: {
          attachmentCount: "1",
          attachmentKinds: "image",
          attachmentNames: "snapshot.png",
          attachmentUrls: "https://example.com/snapshot.png",
          attachmentMimeTypes: "image/png",
        },
      },
      "trace-inbox",
      "session-1",
      "accepted",
    );
    const outboxRecord = recording.recordOutbox(
      "api",
      "trace-outbox",
      "session-1",
      {
        id: "delivery-1",
        target: {
          platform: "api",
          mode: "explicit",
          channelId: "room-1",
        },
        text: "sent message",
        createdAt: "2026-03-30T00:00:00.000Z",
      },
      {
        roomId: "room-1",
        userId: "user-1",
        text: "sent message",
        metadata: {
          attachmentCount: "1",
          attachmentKinds: "image",
          attachmentNames: "response.png",
          attachmentUrls: "https://example.com/response.png",
          attachmentMimeTypes: "image/png",
        },
      },
      "sent",
    );
    recording.pushTrace({
      traceId: "trace-deliver",
      at: "2026-03-30T00:00:01.000Z",
      kind: "deliver",
      platform: "api",
      detail: "Delivered API response.",
      sessionId: "session-1",
    });
    const supervisionRecord = recording.recordSupervision(
      "api",
      "watch",
      "API transport stayed healthy.",
    );
    recording.writeRuntimeStatus();

    const state = ensurePlatformState("api");

    expect(inboxRecord.status).toBe("accepted");
    expect(outboxRecord.status).toBe("sent");
    expect(supervisionRecord.action).toBe("watch");
    expect(traceLog.length).toBe(1);
    expect(inboxLog.length).toBe(1);
    expect(outboxLog.length).toBe(1);
    expect(attachmentLog.length).toBe(2);
    expect(supervisionLog.length).toBe(1);
    expect(state.inboxCount).toBe(1);
    expect(state.outboxCount).toBe(1);
    expect(state.attachmentCount).toBe(2);
    expect(state.lastDeliveryId).toBe("delivery-1");
    expect(state.lastTraceKind).toBe("deliver");
    expect(state.transportState).toBe("degraded");
    expect(events).toEqual([
      {
        kind: "deliver",
        platform: "api",
        detail: "Delivered API response.",
      },
      {
        kind: "lifecycle",
        platform: "api",
        detail: "API transport stayed healthy.",
      },
    ]);
    expect(readFileSync(inboxPath, "utf8")).toContain("trace-inbox");
    expect(readFileSync(outboxPath, "utf8")).toContain("trace-outbox");
    expect(readFileSync(attachmentsPath, "utf8")).toContain("response.png");
    expect(readFileSync(supervisionPath, "utf8")).toContain("watch");
    expect(readFileSync(runtimeStatusPath, "utf8")).toContain('"pid": 123');

    rmSync(root, { recursive: true, force: true });
  });
});

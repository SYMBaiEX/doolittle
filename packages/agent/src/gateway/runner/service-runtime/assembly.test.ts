import { describe, expect, it, mock } from "bun:test";
import type { GatewayHistoryFilter } from "@/gateway/read/history-view";
import type { GatewayRuntimeStatus } from "@/gateway/read/read-model";
import type {
  GatewayRunnerRuntimeAssembly,
  GatewayRunnerRuntimeAssemblyInput,
} from "@/gateway/runner/composition/types";
import type { GatewayRunnerContext } from "@/gateway/runner/context";
import type { NativeMessagingTransportState } from "@/runtime/native/service-bridge/control-planes";
import type { PlatformName } from "@/types/gateway";
import { GatewayRunnerRuntimeState } from "./state";

describe("assembleGatewayRunnerRuntime", () => {
  it("passes platform accessors, state bindings, and native wrappers into composition", async () => {
    const platformAccessors = {
      getConfiguredPlatforms: mock(
        () => ["discord", "telegram"] as PlatformName[],
      ),
      isPlatformEnabled: mock(
        (platform: PlatformName) => platform === "discord",
      ),
      getNativeMessagingState: mock((platform: PlatformName) => {
        const messagingPlatform =
          platform === "telegram" ? "telegram" : "discord";
        return {
          platform: messagingPlatform,
          pluginId: `${platform}-plugin`,
          pluginSource: "official",
          configEnabled: true,
          pluginEnabled: true,
          gatewayEnabled: true,
          serviceName: `${platform}Service`,
          serviceAvailable: true,
          live: true,
          ready: true,
          reason: "live",
          detail: `${platform} connected`,
          summary: `${platform} connected`,
        } satisfies NativeMessagingTransportState;
      }),
    };
    const resolvedPlugin = { type: "native-plugin" } as never;
    const transportControlPlane = {
      type: "transport-control-plane",
    } as never;
    let capturedCompositionInput: GatewayRunnerRuntimeAssemblyInput | undefined;
    let composedRuntimeAssembly: GatewayRunnerRuntimeAssembly;

    mock.module("@/gateway/runner/composition/compose", () => ({
      composeGatewayRunnerRuntime: (
        input: GatewayRunnerRuntimeAssemblyInput,
      ) => {
        capturedCompositionInput = input;
        return composedRuntimeAssembly;
      },
    }));

    mock.module("@/gateway/runner/platform-accessors", () => ({
      createGatewayRunnerPlatformAccessors: (_context: unknown) => {
        return platformAccessors;
      },
    }));

    mock.module("@/gateway/runner/native-resolution", () => ({
      resolveNativeMessagingPlugin: (_input: unknown) => resolvedPlugin,
    }));

    mock.module("@/runtime/native/service-bridge/transport-control", () => ({
      getNativeTransportControlPlane: (
        _runtime: unknown,
        _config: unknown,
        _gatewayConfig: unknown,
      ) => transportControlPlane,
    }));

    const context = {
      config: { id: "config" },
      runtime: { id: "runtime" },
      services: {
        gatewayConfig: { id: "gateway-config" },
      },
    } as unknown as GatewayRunnerContext;
    const state = new GatewayRunnerRuntimeState();

    state.adapters.set("discord", {
      start: async () => {},
      stop: async () => {},
      health: async () => ({ ready: true }) as never,
    } as never);
    state.platformStates.set("discord", {
      platform: "discord",
      enabled: true,
    } as never);
    state.restartBackoffByPlatform.set("discord", {
      attempts: 1,
    } as never);
    state.daemonState.lastWatchdogAt = "2026-04-11T00:00:00.000Z";
    state.setRunning(true);
    state.setStartedAt("2026-04-11T00:01:00.000Z");
    state.setStoppedAt("2026-04-11T00:02:00.000Z");
    state.setLastHeartbeatAt("2026-04-11T00:03:00.000Z");
    state.setLastSupervisionAt("2026-04-11T00:04:00.000Z");

    const createAdapter = mock((platform: string) => ({ platform }) as never);
    const heartbeatSnapshot = { kind: "heartbeat" } as never;
    const watchdogRecords = [{ kind: "watchdog" }] as never;
    const lifecycleEvent = {
      at: "2026-04-11T00:05:00.000Z",
      kind: "heartbeat",
      detail: "manual",
    } as never;
    const stateSnapshot = { kind: "snapshot" } as never;
    const runtimeStatus = {
      status: "healthy",
    } as unknown as GatewayRuntimeStatus;
    const runHeartbeat = mock(async (_reason?: string) => heartbeatSnapshot);
    const runWatchdog = mock(async (_reason?: string) => watchdogRecords);
    const observeAdapter = mock(
      async (_platform: string, _event: unknown) => undefined,
    );
    const snapshotState = mock(
      async (
        _reason: string,
        _limit?: number,
        _filters?: GatewayHistoryFilter,
      ) => stateSnapshot,
    );
    const getRuntimeStatus = mock(() => runtimeStatus);

    composedRuntimeAssembly = {
      snapshotPath: "/tmp/gateway/state.json",
      snapshotHistoryPath: "/tmp/gateway/history.json",
      runtimeStatusPath: "/tmp/gateway/runtime-status.json",
      supervisionPath: "/tmp/gateway/supervision.json",
      inboxPath: "/tmp/gateway/inbox.json",
      outboxPath: "/tmp/gateway/outbox.json",
      attachmentsPath: "/tmp/gateway/attachments.json",
      traceLog: [],
      inboxLog: [],
      outboxLog: [
        {
          deliveryId: "delivery-1",
          sessionId: "session-old",
        },
        {
          deliveryId: "delivery-2",
          sessionId: "session-2",
        },
        {
          deliveryId: "delivery-1",
          sessionId: "session-new",
        },
      ],
      attachmentLog: [],
      supervisionLog: [],
      stateBookkeeping: { name: "state-bookkeeping" } as never,
      readModel: { name: "read-model" } as never,
      recording: { name: "recording" } as never,
      controlPlane: { name: "control-plane" } as never,
      operations: { name: "operations" } as never,
    } as unknown as GatewayRunnerRuntimeAssembly;

    try {
      const { assembleGatewayRunnerRuntime } = await import(
        `./assembly?assembly-test=${Date.now()}`
      );

      const assembled = assembleGatewayRunnerRuntime({
        context,
        state,
        createAdapter,
        runHeartbeat,
        runWatchdog,
        observeAdapter,
        snapshotState,
        getRuntimeStatus,
      });

      expect(assembled).toBe(composedRuntimeAssembly);

      if (!capturedCompositionInput) {
        throw new Error("Expected composition input to be captured.");
      }

      const input = capturedCompositionInput;

      expect(input.context).toBe(context);
      expect(input.adapters).toBe(state.adapters);
      expect(input.platformStates).toBe(state.platformStates);
      expect(input.daemonState).toBe(state.daemonState);
      expect(input.restartBackoffByPlatform).toBe(
        state.restartBackoffByPlatform,
      );
      expect(input.createAdapter).toBe(createAdapter);
      expect(input.runHeartbeat).toBe(runHeartbeat);
      expect(input.runWatchdog).toBe(runWatchdog);
      expect(input.observeAdapter).toBe(observeAdapter);
      expect(input.snapshotState).toBe(snapshotState);
      expect(input.getRuntimeStatus).toBe(getRuntimeStatus);
      expect(input.getConfiguredPlatforms).toBe(
        platformAccessors.getConfiguredPlatforms,
      );
      expect(input.isPlatformEnabled).toBe(platformAccessors.isPlatformEnabled);
      expect(input.getNativeMessagingState).toBe(
        platformAccessors.getNativeMessagingState,
      );

      expect(input.getConfiguredPlatforms()).toEqual(["discord", "telegram"]);
      expect(input.isPlatformEnabled("discord")).toBe(true);
      expect(input.getNativeMessagingState("discord")).toMatchObject({
        platform: "discord",
        ready: true,
      });

      expect(input.resolveNativeMessagingPlugin("discord")).toBe(
        resolvedPlugin,
      );
      expect(input.getTransportControlPlane()).toBe(transportControlPlane);

      expect(input.isRunning()).toBe(true);
      input.setRunning(false);
      expect(state.getRunning()).toBe(false);

      expect(input.getStartedAt()).toBe("2026-04-11T00:01:00.000Z");
      input.setStartedAt("2026-04-11T00:10:00.000Z");
      expect(state.getStartedAt()).toBe("2026-04-11T00:10:00.000Z");

      expect(input.getStoppedAt()).toBe("2026-04-11T00:02:00.000Z");
      input.setStoppedAt("2026-04-11T00:11:00.000Z");
      expect(state.getStoppedAt()).toBe("2026-04-11T00:11:00.000Z");

      expect(input.getLastHeartbeatAt()).toBe("2026-04-11T00:03:00.000Z");
      input.setLastHeartbeatAt("2026-04-11T00:12:00.000Z");
      expect(state.getLastHeartbeatAt()).toBe("2026-04-11T00:12:00.000Z");

      const heartbeatInterval = {
        name: "heartbeat-interval",
      } as unknown as ReturnType<typeof setInterval>;
      input.setHeartbeatInterval(heartbeatInterval);
      expect(state.getHeartbeatInterval()).toBe(heartbeatInterval);
      expect(input.getHeartbeatInterval()).toBe(heartbeatInterval);

      const supervisionInterval = {
        name: "supervision-interval",
      } as unknown as ReturnType<typeof setInterval>;
      input.setSupervisionInterval(supervisionInterval);
      expect(state.getSupervisionInterval()).toBe(supervisionInterval);
      expect(input.getSupervisionInterval()).toBe(supervisionInterval);

      input.setLastSupervisionAt("2026-04-11T00:13:00.000Z");
      expect(state.getLastSupervisionAt()).toBe("2026-04-11T00:13:00.000Z");
      expect(input.getWatchdogAt()).toBe("2026-04-11T00:00:00.000Z");
      expect(input.getRuntimeMeta()).toMatchObject({
        pid: expect.any(Number),
        running: false,
        startedAt: "2026-04-11T00:10:00.000Z",
        stoppedAt: "2026-04-11T00:11:00.000Z",
        lastHeartbeatAt: "2026-04-11T00:12:00.000Z",
        lastWatchdogAt: "2026-04-11T00:00:00.000Z",
        lastSupervisionAt: "2026-04-11T00:13:00.000Z",
        adapterPlatforms: ["discord"],
        updatedAt: expect.any(String),
      });

      await expect(input.runHeartbeat("manual-heartbeat")).resolves.toBe(
        heartbeatSnapshot,
      );
      expect(runHeartbeat).toHaveBeenCalledWith("manual-heartbeat");

      await expect(input.runWatchdog("manual-watchdog")).resolves.toBe(
        watchdogRecords,
      );
      expect(runWatchdog).toHaveBeenCalledWith("manual-watchdog");

      await expect(
        input.observeAdapter("discord", lifecycleEvent),
      ).resolves.toBeUndefined();
      expect(observeAdapter).toHaveBeenCalledWith("discord", lifecycleEvent);

      const filters = {
        platforms: ["discord"],
      } as unknown as GatewayHistoryFilter;
      await expect(
        input.snapshotState("manual-snapshot", 5, filters),
      ).resolves.toBe(stateSnapshot);
      expect(snapshotState).toHaveBeenCalledWith("manual-snapshot", 5, filters);

      expect(input.getRuntimeStatus()).toBe(runtimeStatus);
      expect(getRuntimeStatus).toHaveBeenCalledTimes(1);

      expect(input.getOutboxSessionIdByDeliveryId("delivery-1")).toBe(
        "session-new",
      );
      expect(input.getOutboxSessionIdByDeliveryId("missing-delivery")).toBe(
        undefined,
      );
    } finally {
      mock.restore();
      mock.clearAllMocks();
    }
  });
});

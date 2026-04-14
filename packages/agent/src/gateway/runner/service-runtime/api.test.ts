import { describe, expect, it } from "bun:test";
import type { GatewayHistoryFilter } from "@/gateway/read/history-view";
import type { GatewayRuntimeStatus } from "@/gateway/read/read-model";
import type {
  GatewayReceiveOptions,
  GatewayReceiveResult,
} from "@/gateway/receive/index";
import type { GatewayInboxReplayResult } from "@/gateway/receive/replay";
import type { GatewayRunnerRuntimeApiDependencies } from "@/gateway/runner/service-runtime/api";
import type {
  GatewayRunnerEditDeliveryOptions,
  GatewayRunnerProgressiveTarget,
  GatewayRunnerSendToHomesOptions,
  GatewayRunnerUpdateListener,
} from "@/gateway/runner/service-runtime/types";
import type {
  GatewayHistorySnapshot,
  GatewayStateSnapshot,
  GatewayTransportDetail,
} from "@/gateway/state/state-snapshot";
import type { GatewaySupervisionRecord } from "@/gateway/supervision/index";
import type {
  DeliveredMessageRecord,
  IncomingPlatformMessage,
  PlatformName,
} from "@/types/gateway";
import type { PlatformHealth } from "../../platforms/base";

function createDependencies(): GatewayRunnerRuntimeApiDependencies {
  const heartbeatResult = {
    source: "heartbeat",
    reason: "manual",
  } as unknown as GatewayStateSnapshot;
  const superviseResult = [
    { kind: "supervise", reason: "review" },
  ] as unknown as GatewaySupervisionRecord[];
  const watchdogResult = [
    { kind: "watchdog", reason: "cycle" },
  ] as unknown as GatewaySupervisionRecord[];
  const watchResult = [
    { platform: "discord", reason: "manual-watch" },
  ] as unknown as GatewaySupervisionRecord[];
  const restartResult = [
    { platform: "telegram", reason: "manual" },
  ] as unknown as GatewaySupervisionRecord[];
  const runtimeStatus = { status: "ok" } as unknown as GatewayRuntimeStatus;
  const transport = {
    platform: "discord",
  } as unknown as GatewayTransportDetail;
  const health = [{ ready: true }] as unknown as PlatformHealth[];
  const trace = [{ limit: 5, filters: { platforms: ["discord"] } }] as never;
  const state = {
    limit: 7,
    filters: undefined,
  } as unknown as GatewayStateSnapshot;
  const history = {
    limit: 9,
    filters: undefined,
  } as unknown as GatewayHistorySnapshot;
  const inbox = [{ limit: 3, filters: undefined }] as never;
  const outbox = [{ limit: 4, filters: undefined }] as never;
  const attachments = [{ limit: 6, filters: undefined }] as never;
  const supervision = [{ limit: 8 }] as unknown as GatewaySupervisionRecord[];
  const replayInbox = {
    recordId: "record-1",
  } as unknown as GatewayInboxReplayResult;
  const receiveResult = {
    message: { platform: "discord" },
    options: { replay: true },
  } as unknown as GatewayReceiveResult;
  const sendToHomes = [
    { text: "hello", options: undefined },
  ] as unknown as DeliveredMessageRecord[];
  const editDelivery = {
    deliveryId: "delivery-1",
    text: "updated",
    options: { replyToId: "root" },
  } as unknown as DeliveredMessageRecord;
  const sendProgressive = {
    target: { platform: "discord", roomId: "room-1" },
    parts: ["a", "b"],
  } as unknown as DeliveredMessageRecord;
  const snapshotState = {
    reason: "manual",
    limit: 12,
    filters: undefined,
  } as unknown as GatewayHistorySnapshot;

  return {
    controlPlane: {
      start: async () => {},
      stop: async () => {},
      heartbeat: async () => heartbeatResult,
      supervise: async () => superviseResult,
      watchdog: async () => watchdogResult,
      watch: async () => watchResult,
      restart: async () => restartResult,
    },
    readModel: {
      runtimeStatus: () => runtimeStatus,
      transport: async (_platform: PlatformName) => transport,
      transportOverview: async () =>
        ({
          details: [],
          mismatchCount: 1,
          operationalCount: 2,
        }) as never,
      health: async () => health,
      trace: (_limit?: number, _filters?: GatewayHistoryFilter) => trace,
      state: async (_limit?: number, _filters?: GatewayHistoryFilter) => state,
      history: async (_limit?: number, _filters?: GatewayHistoryFilter) =>
        history,
      inbox: (_limit?: number, _filters?: GatewayHistoryFilter) => inbox,
      outbox: (_limit?: number, _filters?: GatewayHistoryFilter) => outbox,
      attachments: (_limit?: number, _filters?: GatewayHistoryFilter) =>
        attachments,
      supervision: (_limit?: number) => supervision,
      replayInbox: async (_recordId: string) => replayInbox,
    } as unknown as GatewayRunnerRuntimeApiDependencies["readModel"],
    recording: {
      onUpdate: (listener: GatewayRunnerUpdateListener) => {
        listener({
          kind: "lifecycle",
          platform: "gateway",
          detail: "updated",
        });
        return () => {};
      },
    } as never,
    operations: {
      receive: async (
        _message: IncomingPlatformMessage,
        _options?: GatewayReceiveOptions,
      ) => receiveResult,
      sendToHomes: async (
        _text: string,
        _options?: GatewayRunnerSendToHomesOptions,
      ) => sendToHomes,
      editDelivery: async (
        _deliveryId: string,
        _text: string,
        _options?: GatewayRunnerEditDeliveryOptions,
      ) => editDelivery,
      sendProgressive: async (
        _target: GatewayRunnerProgressiveTarget,
        _parts: string[],
      ) => sendProgressive,
    } as never,
    stateBookkeeping: {
      snapshotState: async (
        _reason: string,
        _limit?: number,
        _filters?: GatewayHistoryFilter,
      ) => snapshotState,
    } as never,
  };
}

async function loadCreateGatewayRunnerRuntimeApi() {
  const mod = await import(`./api?api-test=${Date.now()}`);
  return mod.createGatewayRunnerRuntimeApi;
}

describe("gateway runner runtime api", () => {
  it("delegates control, read, delivery, and recording surfaces", async () => {
    const createGatewayRunnerRuntimeApi =
      await loadCreateGatewayRunnerRuntimeApi();
    const api = createGatewayRunnerRuntimeApi(createDependencies());
    const expected = createDependencies();
    const events: Array<{ kind: string; detail: string }> = [];

    await api.control.start();
    await api.control.stop();
    expect(await api.control.heartbeat("manual")).toEqual(
      await expected.controlPlane.heartbeat(),
    );
    expect(await api.control.supervise("review")).toEqual(
      await expected.controlPlane.supervise(),
    );
    expect(await api.control.watchdog("cycle")).toEqual(
      await expected.controlPlane.watchdog(),
    );
    expect(await api.control.watch("discord", "manual-watch")).toEqual(
      await expected.controlPlane.watch("discord", "manual-watch"),
    );
    expect(await api.control.restart("telegram", "manual")).toEqual(
      await expected.controlPlane.restart("telegram", "manual"),
    );

    expect(api.read.runtimeStatus()).toEqual(
      expected.readModel.runtimeStatus(),
    );
    expect(await api.read.transport("discord")).toEqual(
      await expected.readModel.transport("discord"),
    );
    expect(await api.read.transportOverview()).toEqual({
      details: [],
      mismatchCount: 1,
      operationalCount: 2,
    });
    expect(await api.read.health()).toEqual(await expected.readModel.health());
    expect(api.read.trace(5, { platforms: ["discord"] } as never)).toEqual(
      expected.readModel.trace(5, { platforms: ["discord"] } as never),
    );
    expect(await api.read.state(7)).toEqual(await expected.readModel.state(7));
    expect(await api.read.history(9)).toEqual(
      await expected.readModel.history(9),
    );
    expect(api.read.inbox(3)).toEqual(expected.readModel.inbox(3));
    expect(api.read.outbox(4)).toEqual(expected.readModel.outbox(4));
    expect(api.read.attachments(6)).toEqual(expected.readModel.attachments(6));
    expect(api.read.supervision(8)).toEqual(expected.readModel.supervision(8));
    expect(await api.read.replayInbox("record-1")).toEqual(
      await expected.readModel.replayInbox("record-1"),
    );

    expect(
      await api.delivery.receive(
        { platform: "discord" } as never,
        {
          replay: true,
        } as never,
      ),
    ).toEqual(
      await expected.operations.receive(
        { platform: "discord" } as never,
        {
          replay: true,
        } as never,
      ),
    );
    expect(await api.delivery.sendToHomes("hello")).toEqual(
      await expected.operations.sendToHomes("hello"),
    );
    expect(
      await api.delivery.editDelivery("delivery-1", "updated", {
        replyToId: "root",
      }),
    ).toEqual(
      await expected.operations.editDelivery("delivery-1", "updated", {
        replyToId: "root",
      }),
    );
    expect(
      await api.delivery.sendProgressive(
        { platform: "discord", roomId: "room-1" },
        ["a", "b"],
      ),
    ).toEqual(
      await expected.operations.sendProgressive(
        { platform: "discord", roomId: "room-1" },
        ["a", "b"],
      ),
    );

    expect(await api.recording.snapshotState("manual", 12)).toEqual(
      await expected.stateBookkeeping.snapshotState("manual", 12),
    );
    const dispose = api.recording.onUpdate(
      (event: Parameters<GatewayRunnerUpdateListener>[0]) => {
        events.push({ kind: event.kind, detail: event.detail });
      },
    );
    expect(events).toEqual([{ kind: "lifecycle", detail: "updated" }]);
    expect(typeof dispose).toBe("function");
  });
});

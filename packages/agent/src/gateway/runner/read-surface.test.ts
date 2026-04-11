import { describe, expect, it } from "bun:test";
import type { GatewayHistoryFilter } from "@/gateway/read/history-view";
import type {
  GatewayRunnerReadModel,
  GatewayRuntimeStatus,
} from "@/gateway/read/read-model";
import type { GatewayInboxReplayResult } from "@/gateway/receive/replay";
import type { GatewayTransportDetail } from "@/gateway/state/state-snapshot";
import { GatewayRunnerReadSurface } from "./read-surface";

describe("GatewayRunnerReadSurface", () => {
  it("delegates every read method to the underlying read model", async () => {
    const calls: string[] = [];
    const filter: GatewayHistoryFilter = { platform: "api" };
    const runtimeStatus = {
      pid: 123,
    } as unknown as GatewayRuntimeStatus;
    const transportDetail = {
      platform: "api",
    } as unknown as GatewayTransportDetail;
    const replayResult = {
      ok: true,
    } as unknown as GatewayInboxReplayResult;
    const readModel = {
      runtimeStatus() {
        calls.push("runtimeStatus");
        return runtimeStatus;
      },
      transport(platform: string) {
        calls.push(`transport:${platform}`);
        return Promise.resolve({
          ...transportDetail,
          platform,
        } as GatewayTransportDetail);
      },
      transportOverview() {
        calls.push("transportOverview");
        return Promise.resolve({
          details: [],
          mismatchCount: 0,
          operationalCount: 0,
        });
      },
      health() {
        calls.push("health");
        return Promise.resolve([]);
      },
      trace(limit: number, filters?: GatewayHistoryFilter) {
        calls.push(`trace:${limit}:${filters?.platform ?? "none"}`);
        return [] as never[];
      },
      state(limit: number, filters?: GatewayHistoryFilter) {
        calls.push(`state:${limit}:${filters?.platform ?? "none"}`);
        return Promise.resolve({
          limit,
        } as never);
      },
      history(limit: number, filters?: GatewayHistoryFilter) {
        calls.push(`history:${limit}:${filters?.platform ?? "none"}`);
        return Promise.resolve({
          limit,
        } as never);
      },
      inbox(limit: number, filters?: GatewayHistoryFilter) {
        calls.push(`inbox:${limit}:${filters?.platform ?? "none"}`);
        return [] as never[];
      },
      outbox(limit: number, filters?: GatewayHistoryFilter) {
        calls.push(`outbox:${limit}:${filters?.platform ?? "none"}`);
        return [] as never[];
      },
      attachments(limit: number, filters?: GatewayHistoryFilter) {
        calls.push(`attachments:${limit}:${filters?.platform ?? "none"}`);
        return [] as never[];
      },
      supervision(limit: number) {
        calls.push(`supervision:${limit}`);
        return [];
      },
      replayInbox(recordId: string) {
        calls.push(`replayInbox:${recordId}`);
        return Promise.resolve(replayResult);
      },
    } satisfies Pick<
      GatewayRunnerReadModel,
      | "runtimeStatus"
      | "transport"
      | "transportOverview"
      | "health"
      | "trace"
      | "state"
      | "history"
      | "inbox"
      | "outbox"
      | "attachments"
      | "supervision"
      | "replayInbox"
    >;

    const surface = new GatewayRunnerReadSurface({ readModel });

    expect(surface.runtimeStatus()).toBe(runtimeStatus);
    expect(await surface.transport("api")).toMatchObject({ platform: "api" });
    expect(await surface.transportOverview()).toEqual({
      details: [],
      mismatchCount: 0,
      operationalCount: 0,
    });
    expect(await surface.health()).toEqual([]);
    expect(surface.trace(3, filter)).toEqual([]);
    expect(await surface.state(4, filter)).toMatchObject({ limit: 4 });
    expect(await surface.history(5, filter)).toMatchObject({ limit: 5 });
    expect(surface.inbox(6, filter)).toEqual([]);
    expect(surface.outbox(7, filter)).toEqual([]);
    expect(surface.attachments(8, filter)).toEqual([]);
    expect(surface.supervision(9)).toEqual([]);
    expect(await surface.replayInbox("record-1")).toBe(replayResult);

    expect(calls).toEqual([
      "runtimeStatus",
      "transport:api",
      "transportOverview",
      "health",
      "trace:3:api",
      "state:4:api",
      "history:5:api",
      "inbox:6:api",
      "outbox:7:api",
      "attachments:8:api",
      "supervision:9",
      "replayInbox:record-1",
    ]);
  });
});

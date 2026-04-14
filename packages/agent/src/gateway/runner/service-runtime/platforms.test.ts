import { describe, expect, it } from "bun:test";
import type { PlatformLifecycleEvent } from "@/gateway/platforms/base";
import { observeGatewayRunnerAdapter } from "@/gateway/runner/service-runtime/platforms";
import { GatewayRunnerRuntimeState } from "@/gateway/runner/service-runtime/state";

describe("gateway runner runtime platforms", () => {
  it("skips observation when an adapter is missing or passive", async () => {
    const state = new GatewayRunnerRuntimeState();
    const heartbeat = {
      at: "2026-04-11T00:00:00.000Z",
      kind: "heartbeat",
      detail: "pulse",
    } satisfies PlatformLifecycleEvent;

    await expect(
      observeGatewayRunnerAdapter(state, "discord", heartbeat),
    ).resolves.toBeUndefined();

    state.adapters.set("discord", {
      start: async () => {},
      stop: async () => {},
      health: async () => ({ platform: "discord", ready: true }) as never,
    } as never);

    await expect(
      observeGatewayRunnerAdapter(state, "discord", heartbeat),
    ).resolves.toBeUndefined();
  });

  it("forwards lifecycle events to observing adapters", async () => {
    const state = new GatewayRunnerRuntimeState();
    const observed: PlatformLifecycleEvent[] = [];
    const stop = {
      at: "2026-04-11T01:00:00.000Z",
      kind: "stop",
      detail: "stopped",
    } satisfies PlatformLifecycleEvent;

    state.adapters.set("telegram", {
      start: async () => {},
      stop: async () => {},
      health: async () => ({ platform: "telegram", ready: true }) as never,
      observe: async (event: PlatformLifecycleEvent) => {
        observed.push(event);
      },
    } as never);

    await observeGatewayRunnerAdapter(state, "telegram", stop);

    expect(observed).toEqual([stop]);
  });
});

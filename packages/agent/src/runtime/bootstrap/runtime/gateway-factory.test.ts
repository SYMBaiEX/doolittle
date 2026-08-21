import type { AgentRuntime } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import type { GatewayRunner } from "@/gateway/runner";
import type { AppServices } from "@/services";
import { createGatewayAccessor } from "./gateway-factory";

describe("createGatewayAccessor", () => {
  it("resolves the runner only through the registered Eliza service", () => {
    const setDeferredHydration = vi.fn();
    const runner = { setDeferredHydration } as unknown as GatewayRunner;
    const ensureRunner = vi.fn(() => runner);
    const markWarming = vi.fn();
    const markReady = vi.fn();
    const accessor = createGatewayAccessor({
      services: {
        startupState: { markWarming, markReady },
      } as unknown as AppServices,
      runtime: {
        getService: () => ({ ensureRunner }),
      } as unknown as AgentRuntime,
    });

    expect(accessor.get()).toBe(runner);
    expect(accessor.get()).toBe(runner);
    expect(ensureRunner).toHaveBeenCalledOnce();
    expect(markWarming).toHaveBeenCalledOnce();
    expect(markReady).toHaveBeenCalledOnce();

    const hydrate = vi.fn(async () => undefined);
    accessor.setDeferredHydration(hydrate);
    expect(setDeferredHydration).toHaveBeenCalledWith(hydrate);
  });

  it("binds deferred hydration before lazily creating the runner", () => {
    const setDeferredHydration = vi.fn();
    const runner = { setDeferredHydration } as unknown as GatewayRunner;
    const accessor = createGatewayAccessor({
      services: {
        startupState: { markWarming: vi.fn(), markReady: vi.fn() },
      } as unknown as AppServices,
      runtime: {
        getService: () => ({ ensureRunner: () => runner }),
      } as unknown as AgentRuntime,
    });
    const hydrate = vi.fn(async () => undefined);

    accessor.setDeferredHydration(hydrate);
    accessor.get();

    expect(setDeferredHydration).toHaveBeenCalledWith(hydrate);
  });

  it("requires the Eliza gateway service only when the runner is requested", () => {
    const accessor = createGatewayAccessor({
      services: {} as AppServices,
      runtime: {
        getService: () => null,
      } as unknown as AgentRuntime,
    });

    expect(() => accessor.get()).toThrow(
      "Required Eliza service doolittle_gateway is unavailable.",
    );
  });
});

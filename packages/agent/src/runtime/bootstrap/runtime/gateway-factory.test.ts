import type { AgentRuntime } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import type { GatewayRunner } from "@/gateway/runner";
import type { AppServices } from "@/services";
import { createGatewayAccessor } from "./gateway-factory";

describe("createGatewayAccessor", () => {
  it("resolves the runner only through the registered Eliza service", () => {
    const runner = {} as GatewayRunner;
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

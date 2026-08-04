import { DOOLITTLE_AWARENESS_SERVICE } from "@doolittle/contracts";
import type { IAgentRuntime, Service, ServiceClass } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import type { AppServices } from "@/services";
import { createAwarenessRuntimeService } from "./awareness-service";

describe("createAwarenessRuntimeService", () => {
  it("lets Eliza own registry initialization and summary composition", async () => {
    const initialize = vi.fn();
    const composeSummary = vi.fn(async () => "runtime summary");
    const services = {
      awareness: {
        initialize,
        composeSummary,
        isInitialized: () => true,
        contributorCount: () => 5,
      },
    } as unknown as AppServices;
    const runtime = {} as IAgentRuntime;
    const Service = createAwarenessRuntimeService(services) as ServiceClass;

    const service = (await Service.start(runtime)) as Service & {
      composeSummary(runtime: IAgentRuntime): Promise<string>;
      isInitialized(): boolean;
      contributorCount(): number;
    };

    expect(Service.serviceType).toBe(DOOLITTLE_AWARENESS_SERVICE);
    expect(initialize).toHaveBeenCalledWith(services);
    await expect(service.composeSummary(runtime)).resolves.toBe(
      "runtime summary",
    );
    expect(service.isInitialized()).toBe(true);
    expect(service.contributorCount()).toBe(5);
  });
});

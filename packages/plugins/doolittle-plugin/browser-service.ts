import type { AppServices } from "@doolittle/agent/plugin-api";
import { DOOLITTLE_BROWSER_SERVICE } from "@doolittle/contracts";
import {
  Service as ElizaService,
  type IAgentRuntime,
  type Service,
  type ServiceClass,
} from "@elizaos/core";

export function createBrowserRuntimeService(
  services: AppServices,
): ServiceClass {
  class BrowserRuntimeService extends ElizaService {
    static serviceType = DOOLITTLE_BROWSER_SERVICE;

    capabilityDescription =
      "Fetches, captures, inspects, and compares web pages with truthful degraded-state reporting.";

    // biome-ignore lint/complexity/noUselessConstructor: ElizaOS ServiceClass expects an optional runtime constructor.
    constructor(runtime?: IAgentRuntime) {
      super(runtime);
    }

    static async start(runtime: IAgentRuntime): Promise<Service> {
      return new BrowserRuntimeService(runtime);
    }

    status() {
      return services.web.status();
    }

    fetch(url: string) {
      return services.web.fetchText(url);
    }

    inspect(url: string) {
      return services.web.inspect(url);
    }

    snapshot(url: string) {
      return services.web.snapshot(url);
    }

    screenshot(url: string) {
      return services.web.screenshot(url);
    }

    capture(url: string) {
      return services.web.capture(url);
    }

    analyze(url: string) {
      return services.web.analyze(url);
    }

    compare(leftUrl: string, rightUrl: string) {
      return services.web.compare(leftUrl, rightUrl);
    }

    analyzeComparison(leftUrl: string, rightUrl: string) {
      return services.web.analyzeComparison(leftUrl, rightUrl);
    }

    async stop(): Promise<void> {}
  }

  return BrowserRuntimeService;
}

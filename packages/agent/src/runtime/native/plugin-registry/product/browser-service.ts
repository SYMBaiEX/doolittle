import { DOOLITTLE_BROWSER_SERVICE } from "@doolittle/contracts";
import {
  Service as ElizaService,
  type IAgentRuntime,
  type Service,
  type ServiceClass,
} from "@elizaos/core";
import {
  BROWSER_SERVICE_TYPE,
  type BrowserService,
  type BrowserWorkspaceCommand,
} from "@elizaos/plugin-browser";
import type { AppServices } from "@/services";
import {
  createDoolittleBrowserTarget,
  DOOLITTLE_BROWSER_TARGET_ID,
} from "./doolittle-browser-target";

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
      const service = new BrowserRuntimeService(runtime);
      const browser = runtime.getService<BrowserService>(BROWSER_SERVICE_TYPE);
      browser?.registerTarget(createDoolittleBrowserTarget(services.web));
      service.browser = browser ?? undefined;
      return service;
    }

    private browser?: BrowserService;

    private async execute<T>(command: BrowserWorkspaceCommand): Promise<T> {
      if (!this.browser) {
        throw new Error("The official Eliza BrowserService is not available.");
      }
      const result = await this.browser.execute(
        command,
        DOOLITTLE_BROWSER_TARGET_ID,
      );
      return result.value as T;
    }

    status() {
      return this.execute({ subaction: "state", name: "status" });
    }

    fetch(url: string) {
      return this.execute({ subaction: "get", name: "fetch", url });
    }

    inspect(url: string) {
      return this.execute({ subaction: "snapshot", name: "inspect", url });
    }

    snapshot(url: string) {
      return this.execute({ subaction: "snapshot", name: "snapshot", url });
    }

    screenshot(url: string) {
      return this.execute({
        subaction: "screenshot",
        name: "screenshot",
        url,
      });
    }

    capture(url: string) {
      return this.execute({ subaction: "snapshot", name: "capture", url });
    }

    analyze(url: string) {
      return this.execute({ subaction: "snapshot", name: "analyze", url });
    }

    compare(leftUrl: string, rightUrl: string) {
      return this.execute({
        subaction: "diff",
        name: "compare",
        url: leftUrl,
        secondaryUrl: rightUrl,
      });
    }

    analyzeComparison(leftUrl: string, rightUrl: string) {
      return this.execute({
        subaction: "diff",
        name: "analyze-comparison",
        url: leftUrl,
        secondaryUrl: rightUrl,
      });
    }

    async stop(): Promise<void> {
      this.browser?.unregisterTarget(DOOLITTLE_BROWSER_TARGET_ID);
    }
  }

  return BrowserRuntimeService;
}

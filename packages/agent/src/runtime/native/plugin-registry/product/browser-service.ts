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
import type { BrowserAnalysisBundle } from "@/services/web/service";
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
      services.web.bindRuntime?.(runtime);
      return new BrowserRuntimeService(runtime);
    }

    private browser?: BrowserService;
    private browserPromise?: Promise<BrowserService>;
    // beta.7 dispatches the command object in-process but has no signal field.
    // Keep per-request cancellation out of serialized commands and tool output.
    private readonly commandSignals = new WeakMap<
      BrowserWorkspaceCommand,
      AbortSignal
    >();

    private async getBrowser(): Promise<BrowserService> {
      if (this.browser) return this.browser;
      if (!this.browserPromise) {
        this.browserPromise = (async () => {
          const browser =
            this.runtime.getService<BrowserService>(BROWSER_SERVICE_TYPE) ??
            ((await this.runtime.getServiceLoadPromise(
              BROWSER_SERVICE_TYPE,
            )) as BrowserService);
          browser.registerTarget(
            createDoolittleBrowserTarget(services.web, (command) =>
              this.commandSignals.get(command),
            ),
          );
          this.browser = browser;
          return browser;
        })().catch((error) => {
          this.browserPromise = undefined;
          throw error;
        });
      }
      return this.browserPromise;
    }

    private async execute<T>(
      command: BrowserWorkspaceCommand,
      abortSignal?: AbortSignal,
    ): Promise<T> {
      abortSignal?.throwIfAborted();
      if (abortSignal) this.commandSignals.set(command, abortSignal);
      try {
        const browser = await this.getBrowser();
        abortSignal?.throwIfAborted();
        const result = await browser.execute(
          command,
          DOOLITTLE_BROWSER_TARGET_ID,
        );
        abortSignal?.throwIfAborted();
        return result.value as T;
      } finally {
        this.commandSignals.delete(command);
      }
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

    async analyze(url: string, abortSignal?: AbortSignal) {
      abortSignal?.throwIfAborted();
      const analysis = await this.execute<BrowserAnalysisBundle>(
        { subaction: "snapshot", name: "prepare-analysis", url },
        abortSignal,
      );
      return services.web.completeAnalysis
        ? services.web.completeAnalysis(analysis, { abortSignal })
        : analysis;
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
      this.browser = undefined;
      this.browserPromise = undefined;
    }
  }

  return BrowserRuntimeService;
}

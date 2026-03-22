import {
  Service as ElizaService,
  type IAgentRuntime,
  type Plugin,
} from "@elizaos/core";

export interface BrowserPluginOptions {
  browser: {
    status(): Promise<unknown>;
    fetchText(url: string): Promise<unknown>;
    inspect(url: string): Promise<unknown>;
    snapshot(url: string): Promise<string>;
    screenshot(url: string): Promise<string>;
    capture(url: string): Promise<unknown>;
    analyze(url: string): Promise<unknown>;
    compare(leftUrl: string, rightUrl: string): Promise<unknown>;
    analyzeComparison(leftUrl: string, rightUrl: string): Promise<unknown>;
  };
}

function summarizeBrowserCapabilities() {
  return {
    operations: [
      "status",
      "fetch",
      "inspect",
      "snapshot",
      "screenshot",
      "capture",
      "analyze",
      "compare",
      "analyzeComparison",
    ],
    multimodal: true,
    captureReady: true,
    analysisReady: true,
  };
}

export function createBrowserPlugin(options: BrowserPluginOptions): Plugin {
  class BrowserService extends ElizaService {
    static serviceType = "browser";
    capabilityDescription =
      "Official-style browser automation service backed by Eliza Agent web capture and analysis workflows.";

    static async start(runtime: IAgentRuntime): Promise<ElizaService> {
      return new BrowserService(runtime);
    }

    async stop(): Promise<void> {
      return;
    }

    status() {
      return options.browser.status();
    }

    summary() {
      return summarizeBrowserCapabilities();
    }

    fetch(url: string) {
      return options.browser.fetchText(url);
    }

    inspect(url: string) {
      return options.browser.inspect(url);
    }

    snapshot(url: string) {
      return options.browser.snapshot(url);
    }

    screenshot(url: string) {
      return options.browser.screenshot(url);
    }

    capture(url: string) {
      return options.browser.capture(url);
    }

    analyze(url: string) {
      return options.browser.analyze(url);
    }

    compare(leftUrl: string, rightUrl: string) {
      return options.browser.compare(leftUrl, rightUrl);
    }

    analyzeComparison(leftUrl: string, rightUrl: string) {
      return options.browser.analyzeComparison(leftUrl, rightUrl);
    }
  }

  return {
    name: "browser",
    description:
      "Official-style browser plugin layered onto Eliza Agent web automation and analysis.",
    services: [BrowserService],
  };
}

export default createBrowserPlugin;

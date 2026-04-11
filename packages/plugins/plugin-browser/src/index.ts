import type {
  BrowserPluginSummary,
  BrowserStatusContract,
} from "@doolittle/contracts";
import {
  Service as ElizaService,
  type IAgentRuntime,
  type Plugin,
} from "@elizaos/core";

interface BrowserPluginDriver {
  status(): Promise<BrowserStatusContract>;
  fetchText(url: string): Promise<unknown>;
  inspect(url: string): Promise<unknown>;
  snapshot(url: string): Promise<string>;
  screenshot(url: string): Promise<string>;
  capture(url: string): Promise<unknown>;
  analyze(url: string): Promise<unknown>;
  compare(leftUrl: string, rightUrl: string): Promise<unknown>;
  analyzeComparison(leftUrl: string, rightUrl: string): Promise<unknown>;
}

export interface BrowserPluginOptions {
  browser: BrowserPluginDriver;
}

async function summarizeBrowserCapabilities(
  browser: Pick<BrowserPluginDriver, "status">,
): Promise<BrowserPluginSummary> {
  const status = await browser.status();
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
    captureReady: status.captureReady ?? false,
    captureMode: status.captureMode ?? "placeholder",
    analysisReady: true,
  };
}

export function createBrowserPlugin(options: BrowserPluginOptions): Plugin {
  class BrowserService extends ElizaService {
    static serviceType = "browser";
    capabilityDescription =
      "Browser automation service backed by Doolittle web capture and analysis workflows, with explicit pixel-versus-placeholder screenshot reporting.";

    static async start(runtime: IAgentRuntime): Promise<ElizaService> {
      return new BrowserService(runtime);
    }

    async stop(): Promise<void> {
      return;
    }

    status() {
      return options.browser.status();
    }

    async summary() {
      return summarizeBrowserCapabilities(options.browser);
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
      "Browser plugin layered onto Doolittle web automation and analysis with truthful capture readiness reporting.",
    services: [BrowserService],
  };
}

export default createBrowserPlugin;

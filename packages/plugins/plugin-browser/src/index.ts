import type { Plugin } from "@elizaos/core";
import {
  createServiceAdapter,
  createServicePlugin,
} from "@elizaos/plugin-compat";

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

export function createBrowserPlugin(options: BrowserPluginOptions): Plugin {
  const BrowserService = createServiceAdapter({
    serviceType: "browser",
    capabilityDescription:
      "Official-style browser automation service backed by Eliza Agent web capture and analysis workflows.",
    create: async () => ({
      status() {
        return options.browser.status();
      },
      fetch(url: string) {
        return options.browser.fetchText(url);
      },
      inspect(url: string) {
        return options.browser.inspect(url);
      },
      snapshot(url: string) {
        return options.browser.snapshot(url);
      },
      screenshot(url: string) {
        return options.browser.screenshot(url);
      },
      capture(url: string) {
        return options.browser.capture(url);
      },
      analyze(url: string) {
        return options.browser.analyze(url);
      },
      compare(leftUrl: string, rightUrl: string) {
        return options.browser.compare(leftUrl, rightUrl);
      },
      analyzeComparison(leftUrl: string, rightUrl: string) {
        return options.browser.analyzeComparison(leftUrl, rightUrl);
      },
    }),
  });

  return createServicePlugin(
    "browser",
    "Official-style browser plugin layered onto Eliza Agent web automation and analysis.",
    BrowserService,
  );
}

export default createBrowserPlugin;

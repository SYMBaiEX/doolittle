import type { Plugin } from "@elizaos/core";
import type { DeferredPluginGroupContext } from "./shared";

export async function loadDeferredBrowserPlugins({
  services,
}: DeferredPluginGroupContext): Promise<Plugin[]> {
  const { createBrowserPlugin } = await import("@elizaos/plugin-browser");

  return [
    createBrowserPlugin({
      browser: {
        status: () => services.web.status(),
        fetchText: (url) => services.web.fetchText(url),
        inspect: (url) => services.web.inspect(url),
        snapshot: (url) => services.web.snapshot(url),
        screenshot: (url) => services.web.screenshot(url),
        capture: (url) => services.web.capture(url),
        analyze: (url) => services.web.analyze(url),
        compare: (leftUrl, rightUrl) => services.web.compare(leftUrl, rightUrl),
        analyzeComparison: (leftUrl, rightUrl) =>
          services.web.analyzeComparison(leftUrl, rightUrl),
      },
    }),
  ];
}

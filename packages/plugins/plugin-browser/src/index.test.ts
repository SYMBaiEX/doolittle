import { describe, expect, it } from "bun:test";
import { createBrowserPlugin } from "./index";

describe("createBrowserPlugin", () => {
  it("exposes browser-native operations and summary metadata", async () => {
    const plugin = createBrowserPlugin({
      browser: {
        status: async () => ({ mode: "browser" }),
        fetchText: async (url) => ({ url, text: "hello" }),
        inspect: async (url) => ({ url, title: "Example" }),
        snapshot: async (url) => `/tmp/${encodeURIComponent(url)}.md`,
        screenshot: async (url) => `/tmp/${encodeURIComponent(url)}.png`,
        capture: async (url) => ({ url, bundle: true }),
        analyze: async (url) => ({ url, prompt: "analyze" }),
        compare: async (leftUrl, rightUrl) => ({ leftUrl, rightUrl }),
        analyzeComparison: async (leftUrl, rightUrl) => ({
          leftUrl,
          rightUrl,
          prompt: "compare",
        }),
      },
    });

    const ServiceCtor = plugin.services?.[0] as unknown as {
      start(runtime?: unknown): Promise<{
        summary(): unknown;
        fetch(url: string): Promise<unknown>;
      }>;
    };
    const service = await ServiceCtor.start();
    expect(service.summary()).toEqual({
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
    });
    expect(await service.fetch("https://example.com")).toEqual({
      url: "https://example.com",
      text: "hello",
    });
  });
});

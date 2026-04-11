import { describe, expect, it } from "bun:test";
import type { AppServices } from "@/services";
import type {
  BrowserAnalysisBundle,
  BrowserCaptureBundle,
  BrowserComparisonAnalysisBundle,
  BrowserComparisonBundle,
  BrowserInspection,
  BrowserStatus,
} from "@/services/web/service";
import type { RuntimeLike } from "../runtime";
import {
  analyzeEffectiveBrowserComparison,
  analyzeEffectiveBrowserPage,
  captureEffectiveBrowserPage,
  compareEffectiveBrowserPages,
  fetchEffectiveBrowserPage,
  getEffectiveBrowserStatus,
  inspectEffectiveBrowserPage,
  screenshotEffectiveBrowserPage,
  snapshotEffectiveBrowserPage,
} from "./index";

function makeBrowserStatus(
  overrides: Partial<BrowserStatus> = {},
): BrowserStatus {
  return {
    provider: "basic",
    ready: true,
    mode: "fallback",
    detail: "ok",
    artifacts: {
      snapshot: true,
      screenshot: true,
      comparison: true,
    },
    captureMode: "placeholder",
    captureReady: false,
    ...overrides,
  };
}

function makeInspection(url: string): BrowserInspection {
  return {
    page: {
      url,
      text: `Page for ${url}`,
      provider: "basic",
      mode: "fallback",
      renderedAt: "2026-03-30T00:00:00.000Z",
      contentType: "text/html",
      contentLength: 10,
      wordCount: 2,
      lineCount: 1,
      linkCount: 0,
      imageCount: 0,
      headingCount: 0,
      contentHash: "hash",
    },
    snapshotPath: `/tmp/${encodeURIComponent(url)}.md`,
    screenshotPath: `/tmp/${encodeURIComponent(url)}.png`,
    screenshotSvgPath: `/tmp/${encodeURIComponent(url)}.svg`,
    captureMode: "placeholder",
    status: makeBrowserStatus(),
  };
}

function makeCapture(url: string): BrowserCaptureBundle {
  return {
    ...makeInspection(url),
    manifestPath: `/tmp/${encodeURIComponent(url)}.json`,
    reportPath: `/tmp/${encodeURIComponent(url)}.txt`,
  };
}

function makeComparison(
  leftUrl: string,
  rightUrl: string,
): BrowserComparisonBundle {
  return {
    left: makeCapture(leftUrl),
    right: makeCapture(rightUrl),
    manifestPath: "/tmp/comparison.json",
    reportPath: "/tmp/comparison.txt",
    summary: {
      titleChanged: false,
      hashChanged: true,
      wordDelta: 1,
      linkDelta: 0,
      imageDelta: 0,
      headingDelta: 0,
    },
  };
}

function makeAnalysis(url: string, prompt: string): BrowserAnalysisBundle {
  return {
    focus: "browser",
    capture: makeCapture(url),
    prompt,
    highlights: [prompt],
  };
}

function makeComparisonAnalysis(
  leftUrl: string,
  rightUrl: string,
  prompt: string,
): BrowserComparisonAnalysisBundle {
  return {
    focus: "browser",
    comparison: makeComparison(leftUrl, rightUrl),
    prompt,
    highlights: [prompt],
  };
}

describe("browser bridge helpers", () => {
  it("prefers native browser operations when available", async () => {
    const runtime = {
      getService(name: string) {
        if (name === "browser") {
          return {
            status: async () => makeBrowserStatus({ mode: "browser" }),
            fetch: async (url: string) => `native-fetch:${url}`,
            inspect: async (url: string) => makeInspection(`${url}:native`),
            snapshot: async (url: string) => `native-snapshot:${url}`,
            screenshot: async (url: string) => `native-screenshot:${url}`,
            capture: async (url: string) => makeCapture(`${url}:native`),
            analyze: async (url: string) =>
              makeAnalysis(url, `native-analyze:${url}`),
            compare: async (leftUrl: string, rightUrl: string) =>
              makeComparison(`${leftUrl}:native`, `${rightUrl}:native`),
            analyzeComparison: async (leftUrl: string, rightUrl: string) =>
              makeComparisonAnalysis(
                leftUrl,
                rightUrl,
                `native-compare:${leftUrl}:${rightUrl}`,
              ),
          };
        }
        return null;
      },
    } as unknown as RuntimeLike;

    const services = {
      web: {
        status: async () => makeBrowserStatus({ detail: "fallback" }),
        fetchText: async (url: string) => `fallback-fetch:${url}`,
        inspect: async (url: string) => makeInspection(`${url}:fallback`),
        snapshot: async (url: string) => `fallback-snapshot:${url}`,
        screenshot: async (url: string) => `fallback-screenshot:${url}`,
        capture: async (url: string) => makeCapture(`${url}:fallback`),
        analyze: async (url: string) =>
          makeAnalysis(url, `fallback-analyze:${url}`),
        compare: async (leftUrl: string, rightUrl: string) =>
          makeComparison(`${leftUrl}:fallback`, `${rightUrl}:fallback`),
        analyzeComparison: async (leftUrl: string, rightUrl: string) =>
          makeComparisonAnalysis(
            leftUrl,
            rightUrl,
            `fallback-compare:${leftUrl}:${rightUrl}`,
          ),
      },
    } as unknown as AppServices;

    const status = await getEffectiveBrowserStatus(runtime, services);
    const page = await fetchEffectiveBrowserPage(
      runtime,
      services,
      "https://a",
    );
    const inspection = await inspectEffectiveBrowserPage(
      runtime,
      services,
      "https://a",
    );
    const snapshot = await snapshotEffectiveBrowserPage(
      runtime,
      services,
      "https://a",
    );
    const screenshot = await screenshotEffectiveBrowserPage(
      runtime,
      services,
      "https://a",
    );
    const capture = await captureEffectiveBrowserPage(
      runtime,
      services,
      "https://a",
    );
    const analysis = await analyzeEffectiveBrowserPage(
      runtime,
      services,
      "https://a",
    );
    const comparison = await compareEffectiveBrowserPages(
      runtime,
      services,
      "https://a",
      "https://b",
    );
    const comparisonAnalysis = await analyzeEffectiveBrowserComparison(
      runtime,
      services,
      "https://a",
      "https://b",
    );

    expect(status).toMatchObject({ mode: "browser" });
    expect(page).toBe("native-fetch:https://a");
    expect(inspection.page.url).toBe("https://a:native");
    expect(snapshot).toBe("native-snapshot:https://a");
    expect(screenshot).toBe("native-screenshot:https://a");
    expect(capture.page.url).toBe("https://a:native");
    expect(analysis.prompt).toBe("native-analyze:https://a");
    expect(comparison.left.page.url).toBe("https://a:native");
    expect(comparisonAnalysis.prompt).toBe(
      "native-compare:https://a:https://b",
    );
  });

  it("uses native browser summary before product fallback status", async () => {
    const runtime = {
      getService(name: string) {
        if (name === "browser") {
          return {
            summary: () => ({
              operations: ["capture", "inspect"],
              multimodal: true,
              captureReady: true,
              analysisReady: true,
            }),
          };
        }
        return null;
      },
    } as unknown as RuntimeLike;

    const services = {
      web: {
        status: async () => makeBrowserStatus({ detail: "product-fallback" }),
      },
    } as unknown as AppServices;

    await expect(getEffectiveBrowserStatus(runtime, services)).resolves.toEqual(
      {
        operations: ["capture", "inspect"],
        multimodal: true,
        captureReady: true,
        analysisReady: true,
      },
    );
  });

  it("falls back to product web services when native browser is absent", async () => {
    const runtime = {
      getService() {
        return null;
      },
    } as unknown as RuntimeLike;

    const services = {
      web: {
        status: async () => makeBrowserStatus({ detail: "fallback-status" }),
        fetchText: async (url: string) => `fallback-fetch:${url}`,
        inspect: async (url: string) => makeInspection(`${url}:fallback`),
        snapshot: async (url: string) => `fallback-snapshot:${url}`,
        screenshot: async (url: string) => `fallback-screenshot:${url}`,
        capture: async (url: string) => makeCapture(`${url}:fallback`),
        analyze: async (url: string) =>
          makeAnalysis(url, `fallback-analyze:${url}`),
        compare: async (leftUrl: string, rightUrl: string) =>
          makeComparison(`${leftUrl}:fallback`, `${rightUrl}:fallback`),
        analyzeComparison: async (leftUrl: string, rightUrl: string) =>
          makeComparisonAnalysis(
            leftUrl,
            rightUrl,
            `fallback-compare:${leftUrl}:${rightUrl}`,
          ),
      },
    } as unknown as AppServices;

    expect(await getEffectiveBrowserStatus(runtime, services)).toMatchObject({
      detail: "fallback-status",
    });
    expect(
      await fetchEffectiveBrowserPage(runtime, services, "https://a"),
    ).toBe("fallback-fetch:https://a");
    expect(
      (await inspectEffectiveBrowserPage(runtime, services, "https://a")).page
        .url,
    ).toBe("https://a:fallback");
    expect(
      await snapshotEffectiveBrowserPage(runtime, services, "https://a"),
    ).toBe("fallback-snapshot:https://a");
    expect(
      await screenshotEffectiveBrowserPage(runtime, services, "https://a"),
    ).toBe("fallback-screenshot:https://a");
    expect(
      (await captureEffectiveBrowserPage(runtime, services, "https://a")).page
        .url,
    ).toBe("https://a:fallback");
    expect(
      (await analyzeEffectiveBrowserPage(runtime, services, "https://a"))
        .prompt,
    ).toBe("fallback-analyze:https://a");
    expect(
      (
        await compareEffectiveBrowserPages(
          runtime,
          services,
          "https://a",
          "https://b",
        )
      ).left.page.url,
    ).toBe("https://a:fallback");
    expect(
      await analyzeEffectiveBrowserComparison(
        runtime,
        services,
        "https://a",
        "https://b",
      ),
    ).toMatchObject({
      prompt: "fallback-compare:https://a:https://b",
    });
  });
});

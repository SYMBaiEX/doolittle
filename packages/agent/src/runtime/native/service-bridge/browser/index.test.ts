import { DOOLITTLE_BROWSER_SERVICE } from "@doolittle/contracts";
import { describe, expect, it } from "vitest";
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
  analyzeBrowserComparison,
  analyzeBrowserPage,
  captureBrowserPage,
  compareBrowserPages,
  fetchBrowserPage,
  getBrowserStatus,
  inspectBrowserPage,
  screenshotBrowserPage,
  snapshotBrowserPage,
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
  it("routes every browser operation through the Eliza lifecycle service", async () => {
    const runtime = {
      getService(name: string) {
        if (name === DOOLITTLE_BROWSER_SERVICE) {
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

    const status = await getBrowserStatus(runtime);
    const page = await fetchBrowserPage(runtime, "https://a");
    const inspection = await inspectBrowserPage(runtime, "https://a");
    const snapshot = await snapshotBrowserPage(runtime, "https://a");
    const screenshot = await screenshotBrowserPage(runtime, "https://a");
    const capture = await captureBrowserPage(runtime, "https://a");
    const analysis = await analyzeBrowserPage(runtime, "https://a");
    const comparison = await compareBrowserPages(
      runtime,
      "https://a",
      "https://b",
    );
    const comparisonAnalysis = await analyzeBrowserComparison(
      runtime,
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

  it("fails explicitly when the required Eliza browser service is absent", async () => {
    const runtime = {
      getService() {
        return null;
      },
    } as unknown as RuntimeLike;

    const expected = /Required Eliza service doolittle_browser is unavailable/;
    await expect(getBrowserStatus(runtime)).rejects.toThrow(expected);
    await expect(fetchBrowserPage(runtime, "https://a")).rejects.toThrow(
      expected,
    );
    await expect(inspectBrowserPage(runtime, "https://a")).rejects.toThrow(
      expected,
    );
    await expect(snapshotBrowserPage(runtime, "https://a")).rejects.toThrow(
      expected,
    );
    await expect(screenshotBrowserPage(runtime, "https://a")).rejects.toThrow(
      expected,
    );
    await expect(captureBrowserPage(runtime, "https://a")).rejects.toThrow(
      expected,
    );
    await expect(analyzeBrowserPage(runtime, "https://a")).rejects.toThrow(
      expected,
    );
    await expect(
      compareBrowserPages(runtime, "https://a", "https://b"),
    ).rejects.toThrow(expected);
    await expect(
      analyzeBrowserComparison(runtime, "https://a", "https://b"),
    ).rejects.toThrow(expected);
  });
});

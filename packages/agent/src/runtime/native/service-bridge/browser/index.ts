import { DOOLITTLE_BROWSER_SERVICE } from "@doolittle/contracts";
import type {
  BrowserAnalysisBundle,
  BrowserCaptureBundle,
  BrowserComparisonAnalysisBundle,
  BrowserComparisonBundle,
  BrowserInspection,
  WebPageSnapshot,
} from "@/services/web/service";
import { getNativeServices } from "../runtime";
import type { NativeBrowserService, RuntimeLike } from "../runtime-contracts";

export function requireNativeBrowser(
  runtime: RuntimeLike,
): NativeBrowserService {
  const service = getNativeServices(runtime).browser as
    | NativeBrowserService
    | undefined;
  if (!service) {
    throw new Error(
      `Required Eliza service ${DOOLITTLE_BROWSER_SERVICE} is unavailable.`,
    );
  }
  return service;
}

export async function getBrowserStatus(runtime: RuntimeLike) {
  return requireNativeBrowser(runtime).status();
}

export async function fetchBrowserPage(
  runtime: RuntimeLike,
  url: string,
): Promise<string | WebPageSnapshot> {
  return requireNativeBrowser(runtime).fetch(url);
}

export async function inspectBrowserPage(
  runtime: RuntimeLike,
  url: string,
): Promise<BrowserInspection> {
  return requireNativeBrowser(runtime).inspect(url);
}

export async function snapshotBrowserPage(
  runtime: RuntimeLike,
  url: string,
): Promise<string> {
  return requireNativeBrowser(runtime).snapshot(url);
}

export async function screenshotBrowserPage(
  runtime: RuntimeLike,
  url: string,
): Promise<string> {
  return requireNativeBrowser(runtime).screenshot(url);
}

export async function captureBrowserPage(
  runtime: RuntimeLike,
  url: string,
): Promise<BrowserCaptureBundle> {
  return requireNativeBrowser(runtime).capture(url);
}

export async function analyzeBrowserPage(
  runtime: RuntimeLike,
  url: string,
): Promise<BrowserAnalysisBundle> {
  return requireNativeBrowser(runtime).analyze(url);
}

export async function compareBrowserPages(
  runtime: RuntimeLike,
  leftUrl: string,
  rightUrl: string,
): Promise<BrowserComparisonBundle> {
  return requireNativeBrowser(runtime).compare(leftUrl, rightUrl);
}

export async function analyzeBrowserComparison(
  runtime: RuntimeLike,
  leftUrl: string,
  rightUrl: string,
): Promise<BrowserComparisonAnalysisBundle> {
  return requireNativeBrowser(runtime).analyzeComparison(leftUrl, rightUrl);
}

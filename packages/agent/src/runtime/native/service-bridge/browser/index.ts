import type { AppServices } from "@/services";
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

function getNativeBrowser(
  runtime: RuntimeLike,
): NativeBrowserService | undefined {
  return getNativeServices(runtime).browser as NativeBrowserService | undefined;
}

export async function getEffectiveBrowserStatus(
  runtime: RuntimeLike,
  services: AppServices,
) {
  const browser = getNativeBrowser(runtime);
  return (
    (await browser?.status?.()) ??
    browser?.summary?.() ??
    (await services.web.status())
  );
}

export async function fetchEffectiveBrowserPage(
  runtime: RuntimeLike,
  services: AppServices,
  url: string,
): Promise<string | WebPageSnapshot> {
  const browser = getNativeBrowser(runtime);
  return browser ? browser.fetch(url) : services.web.fetchText(url);
}

export async function inspectEffectiveBrowserPage(
  runtime: RuntimeLike,
  services: AppServices,
  url: string,
): Promise<BrowserInspection> {
  const browser = getNativeBrowser(runtime);
  return browser ? browser.inspect(url) : services.web.inspect(url);
}

export async function snapshotEffectiveBrowserPage(
  runtime: RuntimeLike,
  services: AppServices,
  url: string,
): Promise<string> {
  const browser = getNativeBrowser(runtime);
  return browser ? browser.snapshot(url) : services.web.snapshot(url);
}

export async function screenshotEffectiveBrowserPage(
  runtime: RuntimeLike,
  services: AppServices,
  url: string,
): Promise<string> {
  const browser = getNativeBrowser(runtime);
  return browser ? browser.screenshot(url) : services.web.screenshot(url);
}

export async function captureEffectiveBrowserPage(
  runtime: RuntimeLike,
  services: AppServices,
  url: string,
): Promise<BrowserCaptureBundle> {
  const browser = getNativeBrowser(runtime);
  return browser ? browser.capture(url) : services.web.capture(url);
}

export async function analyzeEffectiveBrowserPage(
  runtime: RuntimeLike,
  services: AppServices,
  url: string,
): Promise<BrowserAnalysisBundle> {
  const browser = getNativeBrowser(runtime);
  return browser ? browser.analyze(url) : services.web.analyze(url);
}

export async function compareEffectiveBrowserPages(
  runtime: RuntimeLike,
  services: AppServices,
  leftUrl: string,
  rightUrl: string,
): Promise<BrowserComparisonBundle> {
  const browser = getNativeBrowser(runtime);
  return browser
    ? browser.compare(leftUrl, rightUrl)
    : services.web.compare(leftUrl, rightUrl);
}

export async function analyzeEffectiveBrowserComparison(
  runtime: RuntimeLike,
  services: AppServices,
  leftUrl: string,
  rightUrl: string,
): Promise<BrowserComparisonAnalysisBundle> {
  const browser = getNativeBrowser(runtime);
  return browser
    ? browser.analyzeComparison(leftUrl, rightUrl)
    : services.web.analyzeComparison(leftUrl, rightUrl);
}

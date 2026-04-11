import type { AppServices } from "@/services";
import type {
  BrowserAnalysisBundle,
  BrowserCaptureBundle,
  BrowserComparisonAnalysisBundle,
  BrowserComparisonBundle,
  BrowserInspection,
  BrowserStatus,
  WebPageSnapshot,
} from "@/services/web/service";
import { getNativeServices, type RuntimeLike } from "../runtime";

interface NativeBrowserSummary {
  operations: string[];
  multimodal: boolean;
  captureReady: boolean;
  analysisReady: boolean;
}

interface NativeBrowserService {
  status?(): Promise<BrowserStatus>;
  summary?(): NativeBrowserSummary;
  fetch(url: string): Promise<string | WebPageSnapshot>;
  inspect(url: string): Promise<BrowserInspection>;
  snapshot(url: string): Promise<string>;
  screenshot(url: string): Promise<string>;
  capture(url: string): Promise<BrowserCaptureBundle>;
  analyze(url: string): Promise<BrowserAnalysisBundle>;
  compare(leftUrl: string, rightUrl: string): Promise<BrowserComparisonBundle>;
  analyzeComparison(
    leftUrl: string,
    rightUrl: string,
  ): Promise<BrowserComparisonAnalysisBundle>;
}

type BrowserAnalysisResult = { prompt: string } & Record<string, unknown>;

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
  return (
    (await getNativeBrowser(runtime)?.fetch(url)) ?? services.web.fetchText(url)
  );
}

export async function inspectEffectiveBrowserPage(
  runtime: RuntimeLike,
  services: AppServices,
  url: string,
): Promise<BrowserInspection> {
  return (
    (await getNativeBrowser(runtime)?.inspect(url)) ?? services.web.inspect(url)
  );
}

export async function snapshotEffectiveBrowserPage(
  runtime: RuntimeLike,
  services: AppServices,
  url: string,
): Promise<string> {
  return (
    ((await getNativeBrowser(runtime)?.snapshot(url)) as string | undefined) ??
    ((await services.web.snapshot(url)) as string)
  );
}

export async function screenshotEffectiveBrowserPage(
  runtime: RuntimeLike,
  services: AppServices,
  url: string,
): Promise<string> {
  return (
    (await getNativeBrowser(runtime)?.screenshot(url)) ??
    services.web.screenshot(url)
  );
}

export async function captureEffectiveBrowserPage(
  runtime: RuntimeLike,
  services: AppServices,
  url: string,
): Promise<BrowserCaptureBundle> {
  return (
    (await getNativeBrowser(runtime)?.capture(url)) ?? services.web.capture(url)
  );
}

export async function analyzeEffectiveBrowserPage(
  runtime: RuntimeLike,
  services: AppServices,
  url: string,
): Promise<BrowserAnalysisResult> {
  return (((await getNativeBrowser(runtime)?.analyze(url)) as
    | BrowserAnalysisResult
    | undefined) ?? services.web.analyze(url)) as BrowserAnalysisResult;
}

export async function compareEffectiveBrowserPages(
  runtime: RuntimeLike,
  services: AppServices,
  leftUrl: string,
  rightUrl: string,
): Promise<BrowserComparisonBundle> {
  return (
    (await getNativeBrowser(runtime)?.compare(leftUrl, rightUrl)) ??
    services.web.compare(leftUrl, rightUrl)
  );
}

export async function analyzeEffectiveBrowserComparison(
  runtime: RuntimeLike,
  services: AppServices,
  leftUrl: string,
  rightUrl: string,
): Promise<BrowserAnalysisResult> {
  return (((await getNativeBrowser(runtime)?.analyzeComparison(
    leftUrl,
    rightUrl,
  )) as BrowserAnalysisResult | undefined) ??
    services.web.analyzeComparison(leftUrl, rightUrl)) as BrowserAnalysisResult;
}

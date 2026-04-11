import { writeArtifact, writeScreenshotArtifact } from "./artifacts";
import { fetchBrowserPage } from "./fetch-flow";
import {
  createCaptureReadModel,
  createComparisonReadModel,
} from "./read-model";
import type {
  BrowserCaptureBundle,
  BrowserComparisonBundle,
  BrowserConfig,
  BrowserInspection,
  WebServiceState,
} from "./service-types";
import { buildBrowserStatus } from "./status";

export async function writeBrowserSnapshot(
  url: string,
  config: BrowserConfig,
  outputDir: string,
  state: WebServiceState,
): Promise<string> {
  const page = await fetchBrowserPage(url, config, state);
  const artifact = writeArtifact(outputDir, "snapshot", page, [
    "This artifact captures readable text extracted from the page.",
    "It is suitable for search, diffing, and long-form analysis.",
  ]);
  state.touchSnapshot();
  return artifact.markdownPath;
}

export async function writeBrowserScreenshot(
  url: string,
  config: BrowserConfig,
  outputDir: string,
  state: WebServiceState,
): Promise<string> {
  const page = await fetchBrowserPage(url, config, state);
  const artifact = writeScreenshotArtifact(outputDir, page, [
    page.mode === "browser"
      ? "Browser-backed capture is available, so Doolittle emitted a pixel artifact."
      : "Browser-backed capture is unavailable, so Doolittle emitted a placeholder artifact.",
    `Captured from ${page.provider} in ${page.mode} mode.`,
  ]);
  state.touchScreenshot();
  return artifact.screenshotPath;
}

export async function inspectBrowserPage(
  url: string,
  config: BrowserConfig,
  outputDir: string,
  state: WebServiceState,
): Promise<BrowserInspection> {
  const page = await fetchBrowserPage(url, config, state);
  const snapshotArtifact = writeArtifact(outputDir, "snapshot", page, [
    "This artifact captures readable text extracted from the page.",
    "It is suitable for search, diffing, and long-form analysis.",
  ]);
  const screenshotArtifact = writeScreenshotArtifact(outputDir, page, [
    page.mode === "browser"
      ? "Browser-backed capture is available, so Doolittle emitted a pixel artifact."
      : "Browser-backed capture is unavailable, so Doolittle emitted a placeholder artifact.",
    `Captured from ${page.provider} in ${page.mode} mode.`,
  ]);
  state.touchSnapshot();
  state.touchScreenshot();
  return {
    page,
    snapshotPath: snapshotArtifact.markdownPath,
    screenshotPath: screenshotArtifact.screenshotPath,
    screenshotSvgPath: screenshotArtifact.svgPath,
    captureMode: screenshotArtifact.captureMode,
    status: await buildBrowserStatus(config, state.telemetry()),
  };
}

export async function createBrowserCaptureBundle(
  url: string,
  config: BrowserConfig,
  outputDir: string,
  state: WebServiceState,
): Promise<BrowserCaptureBundle> {
  const inspection = await inspectBrowserPage(url, config, outputDir, state);
  const capture = createCaptureReadModel(outputDir, url, inspection);
  state.touchSnapshot();
  return capture;
}

export async function createBrowserComparisonBundle(
  leftUrl: string,
  rightUrl: string,
  config: BrowserConfig,
  outputDir: string,
  state: WebServiceState,
): Promise<BrowserComparisonBundle> {
  const left = await createBrowserCaptureBundle(
    leftUrl,
    config,
    outputDir,
    state,
  );
  const right = await createBrowserCaptureBundle(
    rightUrl,
    config,
    outputDir,
    state,
  );
  const comparison = createComparisonReadModel({
    outputDir,
    leftUrl,
    rightUrl,
    left,
    right,
  });
  state.touchComparison();
  return comparison;
}

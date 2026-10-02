/** `pixel` is a legacy, ambiguous format label, not rendered-page proof. */
export type BrowserCaptureMode =
  | "rendered-page"
  | "capture-card"
  | "placeholder"
  | "pixel";

/** An image extension or a working DOM fetcher does not prove page rendering. */
export function hasRenderedBrowserEvidence(receipt: {
  captureMode?: unknown;
  captureReady?: unknown;
  screenshotPath?: unknown;
}): boolean {
  return (
    receipt.captureMode === "rendered-page" &&
    receipt.captureReady === true &&
    typeof receipt.screenshotPath === "string" &&
    receipt.screenshotPath.trim().length > 0
  );
}

export interface BrowserStatusContract {
  provider: "lightpanda" | "basic";
  ready: boolean;
  mode: "browser" | "fallback";
  detail: string;
  command?: string;
  cdpUrl?: string;
  lastFetchedAt?: string;
  lastSnapshotAt?: string;
  lastScreenshotAt?: string;
  lastComparisonAt?: string;
  lastError?: string;
  artifacts: {
    snapshot: boolean;
    screenshot: boolean;
    comparison: boolean;
  };
  captureMode?: BrowserCaptureMode;
  captureReady?: boolean;
}

export interface BrowserPluginSummary {
  operations: string[];
  multimodal: boolean;
  captureReady: boolean;
  captureMode: BrowserCaptureMode;
  analysisReady: boolean;
}

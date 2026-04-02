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
  captureMode?: "pixel" | "placeholder";
  captureReady?: boolean;
}

export interface BrowserPluginSummary {
  operations: string[];
  multimodal: boolean;
  captureReady: boolean;
  captureMode: "pixel" | "placeholder";
  analysisReady: boolean;
}

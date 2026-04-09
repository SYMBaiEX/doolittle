export interface BrowserConfig {
  provider: "lightpanda" | "basic";
  command: string;
  cdpUrl?: string;
  obeyRobots: boolean;
}

export interface BrowserStatus {
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
  captureMode: "pixel" | "placeholder";
  captureReady: boolean;
}

export interface WebPageSnapshot {
  url: string;
  title?: string;
  metaDescription?: string;
  canonicalUrl?: string;
  text: string;
  provider: "lightpanda" | "basic";
  mode: "browser" | "fallback";
  renderedAt: string;
  contentType: string;
  contentLength: number;
  wordCount: number;
  lineCount: number;
  linkCount: number;
  imageCount: number;
  headingCount: number;
  contentHash: string;
}

export interface BrowserInspection {
  page: WebPageSnapshot;
  snapshotPath: string;
  screenshotPath: string;
  screenshotSvgPath: string;
  captureMode: "pixel" | "placeholder";
  status: BrowserStatus;
}

export interface BrowserCaptureBundle {
  page: WebPageSnapshot;
  snapshotPath: string;
  screenshotPath: string;
  screenshotSvgPath: string;
  captureMode: "pixel" | "placeholder";
  manifestPath: string;
  reportPath: string;
  status: BrowserStatus;
}

export interface BrowserComparisonBundle {
  left: BrowserCaptureBundle;
  right: BrowserCaptureBundle;
  manifestPath: string;
  reportPath: string;
  summary: {
    titleChanged: boolean;
    hashChanged: boolean;
    wordDelta: number;
    linkDelta: number;
    imageDelta: number;
    headingDelta: number;
  };
}

export type BrowserAnalysisFocus = "browser" | "vision" | "research";

export interface BrowserAnalysisBundle {
  focus: BrowserAnalysisFocus;
  capture: BrowserCaptureBundle;
  prompt: string;
  highlights: string[];
}

export interface BrowserComparisonAnalysisBundle {
  focus: BrowserAnalysisFocus;
  comparison: BrowserComparisonBundle;
  prompt: string;
  highlights: string[];
}

export interface WebServiceTelemetry {
  lastFetchedAt?: string;
  lastSnapshotAt?: string;
  lastScreenshotAt?: string;
  lastComparisonAt?: string;
  lastError?: string;
}

export interface WebServiceState {
  touchFetched(): void;
  touchSnapshot(): void;
  touchScreenshot(): void;
  touchComparison(): void;
  setError(message?: string): void;
  telemetry(): WebServiceTelemetry;
}

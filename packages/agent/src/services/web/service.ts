import { mkdirSync } from "node:fs";
import {
  createWebAnalysisBundle,
  createWebComparisonAnalysisBundle,
} from "./analysis";
import {
  createBrowserCaptureBundle,
  createBrowserComparisonBundle,
  inspectBrowserPage,
  writeBrowserScreenshot,
  writeBrowserSnapshot,
} from "./capture-flow";
import { fetchBrowserPage } from "./fetch-flow";
import type {
  BrowserAnalysisBundle,
  BrowserAnalysisFocus,
  BrowserCaptureBundle,
  BrowserComparisonAnalysisBundle,
  BrowserComparisonBundle,
  BrowserConfig,
  BrowserInspection,
  BrowserStatus,
  WebPageSnapshot,
  WebServiceState,
} from "./service-types";
import { buildBrowserStatus } from "./status";

export type {
  BrowserAnalysisBundle,
  BrowserAnalysisFocus,
  BrowserCaptureBundle,
  BrowserComparisonAnalysisBundle,
  BrowserComparisonBundle,
  BrowserConfig,
  BrowserInspection,
  BrowserStatus,
  WebPageSnapshot,
} from "./service-types";

function nowIso(): string {
  return new Date().toISOString();
}

export class WebService {
  private lastFetchedAt?: string;
  private lastSnapshotAt?: string;
  private lastScreenshotAt?: string;
  private lastComparisonAt?: string;
  private lastError?: string;

  constructor(
    private readonly getConfig: () => BrowserConfig,
    private readonly outputDir = ".doolittle/web",
  ) {
    mkdirSync(this.outputDir, { recursive: true });
  }

  async status(): Promise<BrowserStatus> {
    return buildBrowserStatus(this.getConfig(), this.telemetry());
  }

  async fetchText(url: string): Promise<WebPageSnapshot> {
    return fetchBrowserPage(url, this.getConfig(), this.createStateRecorder());
  }

  async snapshot(url: string): Promise<string> {
    return writeBrowserSnapshot(
      url,
      this.getConfig(),
      this.outputDir,
      this.createStateRecorder(),
    );
  }

  async screenshot(url: string): Promise<string> {
    return writeBrowserScreenshot(
      url,
      this.getConfig(),
      this.outputDir,
      this.createStateRecorder(),
    );
  }

  async inspect(url: string): Promise<BrowserInspection> {
    return inspectBrowserPage(
      url,
      this.getConfig(),
      this.outputDir,
      this.createStateRecorder(),
    );
  }

  async capture(url: string): Promise<BrowserCaptureBundle> {
    return createBrowserCaptureBundle(
      url,
      this.getConfig(),
      this.outputDir,
      this.createStateRecorder(),
    );
  }

  async analyze(
    url: string,
    focus: BrowserAnalysisFocus = "vision",
  ): Promise<BrowserAnalysisBundle> {
    const capture = await this.capture(url);
    return createWebAnalysisBundle(capture, focus);
  }

  async compare(
    leftUrl: string,
    rightUrl: string,
  ): Promise<BrowserComparisonBundle> {
    const comparison = await createBrowserComparisonBundle(
      leftUrl,
      rightUrl,
      this.getConfig(),
      this.outputDir,
      this.createStateRecorder(),
    );
    return comparison;
  }

  async analyzeComparison(
    leftUrl: string,
    rightUrl: string,
    focus: BrowserAnalysisFocus = "research",
  ): Promise<BrowserComparisonAnalysisBundle> {
    const comparison = await this.compare(leftUrl, rightUrl);
    return createWebComparisonAnalysisBundle(comparison, focus);
  }

  private telemetry(): {
    lastFetchedAt?: string;
    lastSnapshotAt?: string;
    lastScreenshotAt?: string;
    lastComparisonAt?: string;
    lastError?: string;
  } {
    return {
      lastFetchedAt: this.lastFetchedAt,
      lastSnapshotAt: this.lastSnapshotAt,
      lastScreenshotAt: this.lastScreenshotAt,
      lastComparisonAt: this.lastComparisonAt,
      lastError: this.lastError,
    };
  }

  private createStateRecorder(): WebServiceState {
    return {
      touchFetched: () => {
        this.lastFetchedAt = nowIso();
      },
      touchSnapshot: () => {
        this.lastSnapshotAt = nowIso();
      },
      touchScreenshot: () => {
        this.lastScreenshotAt = nowIso();
      },
      touchComparison: () => {
        this.lastComparisonAt = nowIso();
      },
      setError: (message) => {
        this.lastError = message;
      },
      telemetry: () => this.telemetry(),
    };
  }
}

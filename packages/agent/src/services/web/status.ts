import { browserCommandExists } from "./fetch";
import type {
  BrowserConfig,
  BrowserStatus,
  WebServiceTelemetry,
} from "./service-types";

export async function buildBrowserStatus(
  config: BrowserConfig,
  telemetry: WebServiceTelemetry,
): Promise<BrowserStatus> {
  if (config.provider === "basic") {
    return {
      provider: "basic",
      ready: true,
      mode: "fallback",
      detail: "Basic HTTP fetch mode is active.",
      lastFetchedAt: telemetry.lastFetchedAt,
      lastSnapshotAt: telemetry.lastSnapshotAt,
      lastScreenshotAt: telemetry.lastScreenshotAt,
      lastComparisonAt: telemetry.lastComparisonAt,
      lastError: telemetry.lastError,
      artifacts: {
        snapshot: true,
        screenshot: true,
        comparison: true,
      },
      captureMode: "placeholder",
      captureReady: false,
    };
  }

  const available = await browserCommandExists(config.command);
  return {
    provider: "lightpanda",
    ready: available,
    mode: available ? "browser" : "fallback",
    detail: available
      ? "Lightpanda is available for DOM fetch and text-based capture cards. Rendered-page screenshots are unavailable."
      : "Lightpanda is configured as the default browser provider, but the command is not available locally. Falling back to basic HTTP fetch mode.",
    command: config.command,
    cdpUrl: config.cdpUrl,
    lastFetchedAt: telemetry.lastFetchedAt,
    lastSnapshotAt: telemetry.lastSnapshotAt,
    lastScreenshotAt: telemetry.lastScreenshotAt,
    lastComparisonAt: telemetry.lastComparisonAt,
    lastError: telemetry.lastError,
    artifacts: {
      snapshot: true,
      screenshot: true,
      comparison: true,
    },
    captureMode: available ? "capture-card" : "placeholder",
    // This backend fetches DOM content; neither its PNG card nor its SVG
    // artifact is a capture of rendered page pixels.
    captureReady: false,
  };
}

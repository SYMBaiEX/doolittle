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
      ? "Lightpanda is available for browser-backed fetch, snapshot, and screenshot artifacts."
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
    captureMode: available ? "pixel" : "placeholder",
    captureReady: available,
  };
}

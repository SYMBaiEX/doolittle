export type NativeCaptureFailure =
  | "surface-unavailable"
  | "unknown"
  | "not-implemented"
  | "frame-gone"
  | "copy-timeout"
  | "embedding-token-changed"
  | "viz-empty-bitmap"
  | "viz-error"
  | "unclassified";

export interface NativeCaptureDiagnostic {
  settlement: "fulfilled" | "sync-throw" | "promise-reject";
  durationMs: number | null;
  failure: NativeCaptureFailure | null;
}

/** Exact errors from Electron v44.5.1 electron_api_web_contents.cc:
 * CapturePage and CopyFromSurfaceErrorToString. Never export native error text.
 */
export function classifyNativeCaptureFailure(
  error: unknown,
): NativeCaptureFailure {
  try {
    if (!error || typeof error !== "object") return "unclassified";
    const descriptor = Object.getOwnPropertyDescriptor(error, "message");
    // An accessor or inherited message is not a native own data receipt.
    if (!descriptor || !("value" in descriptor)) return "unclassified";
    switch (descriptor.value) {
      case "Current display surface not available for capture":
        return "surface-unavailable";
      case "Unknown":
        return "unknown";
      case "Not implemented":
        return "not-implemented";
      case "Frame Gone":
        return "frame-gone";
      case "Timeout":
        return "copy-timeout";
      case "EmbeddingTokenChanged":
        return "embedding-token-changed";
      case "VizSentEmptyBitmap":
        return "viz-empty-bitmap";
      case "UnknownVizError":
        return "viz-error";
      default:
        return "unclassified";
    }
  } catch {
    return "unclassified";
  }
}

/** Observe one original call without replacing its promise, result, or error. */
export function observeNativeCapture<Receiver, Args extends unknown[], Result>(
  capture: (this: Receiver, ...args: Args) => Promise<Result>,
  receiver: Receiver,
  args: Args,
  observe: (diagnostic: NativeCaptureDiagnostic) => void,
  clock: () => number = () => performance.now(),
): Promise<Result> {
  const readTime = () => {
    try {
      const value = clock();
      return Number.isFinite(value) ? value : null;
    } catch {
      return null;
    }
  };
  const startedAt = readTime();
  const settled = (
    settlement: NativeCaptureDiagnostic["settlement"],
    failure: NativeCaptureFailure | null,
  ) => {
    try {
      const endedAt = readTime();
      const elapsed =
        startedAt === null || endedAt === null ? null : endedAt - startedAt;
      observe({
        settlement,
        durationMs:
          elapsed !== null && Number.isFinite(elapsed) && elapsed >= 0
            ? elapsed
            : null,
        failure,
      });
    } catch {
      // Even a broken diagnostic observer must not change the native outcome.
    }
  };
  let pending: Promise<Result>;
  try {
    pending = capture.apply(receiver, args);
  } catch (error) {
    settled("sync-throw", classifyNativeCaptureFailure(error));
    throw error;
  }
  try {
    void pending.then(
      () => settled("fulfilled", null),
      (error: unknown) =>
        settled("promise-reject", classifyNativeCaptureFailure(error)),
    );
  } catch {
    // Observation attachment is best effort; return the original promise.
  }
  return pending;
}

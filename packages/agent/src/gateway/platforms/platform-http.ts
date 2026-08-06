/**
 * Outbound platform APIs should fail predictably when an upstream is unhealthy.
 * Fifteen seconds allows normal webhook/API delivery without leaving a gateway
 * turn waiting indefinitely. Pass `timeoutMs: false` only for a genuine stream.
 */
export const DEFAULT_PLATFORM_HTTP_TIMEOUT_MS = 15_000;
export const DEFAULT_PLATFORM_ERROR_TEXT_LIMIT_BYTES = 16 * 1024;

export type PlatformFetchInit = RequestInit & {
  /** Set to false for an intentionally long-lived request. */
  timeoutMs?: number | false;
};

export async function fetchPlatform(
  input: RequestInfo | URL,
  init: PlatformFetchInit = {},
): Promise<Response> {
  const { signal: callerSignal, timeoutMs, ...requestInit } = init;
  const controller = new AbortController();
  const resolvedTimeoutMs =
    timeoutMs === undefined ? DEFAULT_PLATFORM_HTTP_TIMEOUT_MS : timeoutMs;

  if (
    typeof resolvedTimeoutMs === "number" &&
    (!Number.isFinite(resolvedTimeoutMs) || resolvedTimeoutMs < 0)
  ) {
    throw new RangeError(
      "Platform HTTP timeoutMs must be a finite, non-negative number.",
    );
  }

  const abortFromCaller = () => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) {
    abortFromCaller();
  } else {
    callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  const timeout =
    typeof resolvedTimeoutMs === "number"
      ? setTimeout(() => {
          controller.abort(
            new DOMException(
              `Platform HTTP request timed out after ${resolvedTimeoutMs}ms.`,
              "TimeoutError",
            ),
          );
        }, resolvedTimeoutMs)
      : undefined;

  try {
    return await fetch(input, { ...requestInit, signal: controller.signal });
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
}

/** Read a diagnostic response body without retaining an unbounded error payload. */
export async function readPlatformResponseText(
  response: Response,
  maxBytes = DEFAULT_PLATFORM_ERROR_TEXT_LIMIT_BYTES,
): Promise<string> {
  if (!Number.isFinite(maxBytes) || maxBytes < 0) {
    throw new RangeError(
      "Platform response text limit must be a finite, non-negative number.",
    );
  }

  const reader = response.body?.getReader();
  if (!reader) {
    return "";
  }

  const decoder = new TextDecoder();
  let text = "";
  let remainingBytes = maxBytes;
  let truncated = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value || value.byteLength === 0) {
        continue;
      }

      if (value.byteLength > remainingBytes) {
        text += decoder.decode(value.subarray(0, remainingBytes), {
          stream: true,
        });
        truncated = true;
        break;
      }

      text += decoder.decode(value, { stream: true });
      remainingBytes -= value.byteLength;
    }
  } finally {
    if (truncated) {
      await reader.cancel().catch(() => undefined);
    }
  }

  text += decoder.decode();
  return truncated ? `${text}\n[response body truncated]` : text;
}

export type ProviderTransportErrorCode =
  | "cancelled"
  | "incompatible_provider"
  | "invalid_configuration"
  | "no_credentials"
  | "no_output"
  | "payment_required"
  | "rate_limited"
  | "timeout"
  | "unauthorized"
  | "unavailable"
  | "unknown";

export interface ProviderTransportErrorOptions {
  code: ProviderTransportErrorCode;
  provider: string;
  detail?: string;
  operation?: string;
  retryable?: boolean;
  status?: number;
  cause?: unknown;
}

/**
 * Structured failure contract for prompt-only Eliza provider transports.
 *
 * Provider plugins throw this at their SDK boundary so hosts can render
 * recovery UX from stable fields instead of parsing provider prose.
 */
export class ProviderTransportError extends Error {
  readonly code: ProviderTransportErrorCode;
  readonly provider: string;
  readonly detail?: string;
  readonly operation?: string;
  readonly retryable: boolean;
  readonly status?: number;

  constructor(message: string, options: ProviderTransportErrorOptions) {
    super(message, { cause: options.cause });
    this.name = "ProviderTransportError";
    this.code = options.code;
    this.provider = options.provider;
    this.detail = options.detail;
    this.operation = options.operation;
    this.retryable = options.retryable ?? false;
    this.status = options.status;
  }
}

export function providerErrorCodeForStatus(
  status: number,
): ProviderTransportErrorCode {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 402) return "payment_required";
  if (status === 408 || status === 504) return "timeout";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "unavailable";
  return "unknown";
}

export function createProviderHttpError(input: {
  provider: string;
  operation: string;
  status: number;
  detail?: string;
}): ProviderTransportError {
  const code = providerErrorCodeForStatus(input.status);
  const compactDetail = input.detail?.trim() || "empty response";
  return new ProviderTransportError(
    `${input.provider} ${input.operation} failed (${input.status}): ${compactDetail}`,
    {
      code,
      provider: input.provider,
      operation: input.operation,
      status: input.status,
      detail: compactDetail,
      retryable:
        code === "rate_limited" || code === "timeout" || code === "unavailable",
    },
  );
}

export function normalizeProviderTransportError(
  provider: string,
  operation: string,
  error: unknown,
): ProviderTransportError {
  if (error instanceof ProviderTransportError) {
    return error;
  }
  if (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  ) {
    return new ProviderTransportError(
      `${provider} ${operation} was cancelled.`,
      {
        code: "cancelled",
        provider,
        operation,
        cause: error,
      },
    );
  }
  if (error instanceof Error && error.name === "TimeoutError") {
    return new ProviderTransportError(`${provider} ${operation} timed out.`, {
      code: "timeout",
      provider,
      operation,
      retryable: true,
      cause: error,
    });
  }
  return new ProviderTransportError(
    error instanceof Error ? error.message : `${provider} ${operation} failed.`,
    {
      code: "unknown",
      provider,
      operation,
      detail: error instanceof Error ? error.message : String(error),
      cause: error,
    },
  );
}

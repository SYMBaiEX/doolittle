/** The only research failure details allowed in user-facing or durable records. */
export type ResearchFailureCode =
  | "RESEARCH_DISABLED"
  | "RESEARCH_MODEL_UNAVAILABLE"
  | "RESEARCH_AUTHENTICATION_FAILED"
  | "RESEARCH_AUTHORIZATION_FAILED"
  | "RESEARCH_RATE_LIMITED"
  | "RESEARCH_TIMEOUT"
  | "RESEARCH_TRANSPORT_FAILED"
  | "RESEARCH_PROVIDER_FAILED"
  | "RESEARCH_TASK_RECORD_FAILED"
  | "RESEARCH_CANCELLED";

export type ResearchFailure = {
  code: ResearchFailureCode;
  category:
    | "configuration"
    | "availability"
    | "authentication"
    | "authorization"
    | "rate_limit"
    | "timeout"
    | "transport"
    | "provider"
    | "execution"
    | "cancellation";
  message: string;
  httpStatus?: number;
};

const PUBLIC_FAILURES: Record<
  ResearchFailureCode,
  Pick<ResearchFailure, "category" | "message">
> = {
  RESEARCH_DISABLED: {
    category: "configuration",
    message:
      "Deep research is disabled. Enable the configured Eliza Cloud provider to use it.",
  },
  RESEARCH_MODEL_UNAVAILABLE: {
    category: "availability",
    message:
      "Deep research is unavailable: no RESEARCH model handler is registered.",
  },
  RESEARCH_AUTHENTICATION_FAILED: {
    category: "authentication",
    message: "Deep research authentication was rejected by the provider.",
  },
  RESEARCH_AUTHORIZATION_FAILED: {
    category: "authorization",
    message: "Deep research access was denied by the provider.",
  },
  RESEARCH_RATE_LIMITED: {
    category: "rate_limit",
    message: "Deep research was rate limited by the provider.",
  },
  RESEARCH_TIMEOUT: {
    category: "timeout",
    message: "Deep research timed out.",
  },
  RESEARCH_TRANSPORT_FAILED: {
    category: "transport",
    message: "Deep research could not reach the provider.",
  },
  RESEARCH_PROVIDER_FAILED: {
    category: "provider",
    message: "Deep research failed at the provider.",
  },
  RESEARCH_TASK_RECORD_FAILED: {
    category: "execution",
    message: "Deep research could not update its task record.",
  },
  RESEARCH_CANCELLED: {
    category: "cancellation",
    message: "Deep research was cancelled.",
  },
};

export class ResearchPreflightError extends Error {
  constructor(
    readonly code: "RESEARCH_DISABLED" | "RESEARCH_MODEL_UNAVAILABLE",
  ) {
    super(PUBLIC_FAILURES[code].message);
    this.name = "ResearchPreflightError";
  }
}

function field(value: unknown, key: string): unknown {
  if (value === null || typeof value !== "object") return undefined;
  try {
    return (value as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

function httpStatus(value: unknown): number | undefined {
  // Only structured numeric HTTP status is evidence. Never parse body/text.
  for (const candidate of [
    field(value, "status"),
    field(field(value, "response"), "status"),
  ]) {
    if (
      typeof candidate === "number" &&
      Number.isInteger(candidate) &&
      candidate >= 100 &&
      candidate <= 599
    ) {
      return candidate;
    }
  }
  return undefined;
}

function envelope(code: ResearchFailureCode, status?: number): ResearchFailure {
  return {
    code,
    ...PUBLIC_FAILURES[code],
    ...(status === undefined ? {} : { httpStatus: status }),
  };
}

export function classifyResearchFailure(
  error: unknown,
  signal?: AbortSignal,
  source: "provider" | "task" = "provider",
): ResearchFailure {
  if (signal?.aborted) return envelope("RESEARCH_CANCELLED");
  if (error instanceof ResearchPreflightError) return envelope(error.code);
  if (source === "task") return envelope("RESEARCH_TASK_RECORD_FAILED");

  // Walk only a bounded cause chain. Causes can carry SDK HTTP metadata but
  // their arbitrary messages, bodies, headers and URLs are never serialized.
  let current: unknown = error;
  const seen = new Set<unknown>();
  for (let depth = 0; depth < 3 && current && !seen.has(current); depth++) {
    seen.add(current);
    const status = httpStatus(current);
    if (status === 401)
      return envelope("RESEARCH_AUTHENTICATION_FAILED", status);
    if (status === 403)
      return envelope("RESEARCH_AUTHORIZATION_FAILED", status);
    if (status === 429) return envelope("RESEARCH_RATE_LIMITED", status);
    if (status === 408 || status === 504)
      return envelope("RESEARCH_TIMEOUT", status);
    const name = field(current, "name");
    const code = field(current, "code");
    if (name === "TimeoutError" || code === "ETIMEDOUT")
      return envelope("RESEARCH_TIMEOUT", status);
    if (
      code === "ECONNRESET" ||
      code === "ECONNREFUSED" ||
      code === "ENOTFOUND" ||
      code === "EAI_AGAIN"
    ) {
      return envelope("RESEARCH_TRANSPORT_FAILED", status);
    }
    current = field(current, "cause");
  }
  return envelope("RESEARCH_PROVIDER_FAILED", httpStatus(error));
}

export function researchFailureText(failure: ResearchFailure): string {
  return `${failure.message} [${failure.code}${failure.httpStatus === undefined ? "" : `; HTTP ${failure.httpStatus}`}]`;
}

import { Buffer } from "node:buffer";
import type { IncomingMessage } from "node:http";
import { isPlainObject } from "@elizaos/shared/type-guards";

/** Match Eliza's image-capable request ceiling while bounding every route. */
export const MAX_REQUEST_BODY_BYTES = 20 * 1024 * 1024;

export class RequestBodyTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`Request body exceeds the ${maxBytes}-byte limit.`);
    this.name = "RequestBodyTooLargeError";
  }
}

export class RequestBodyTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Request body was not received within ${timeoutMs}ms.`);
    this.name = "RequestBodyTimeoutError";
  }
}

export interface RequestBodyFraming {
  declaredBytes: number | null;
  hasBody: boolean;
  transferEncoded: boolean;
}

function declaredContentLength(request: IncomingMessage): number | null {
  const raw = request.headers["content-length"];
  if (typeof raw !== "string" || !/^\d+$/u.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

export function requestBodyFraming(
  request: IncomingMessage,
): RequestBodyFraming {
  const declaredBytes = declaredContentLength(request);
  const transferEncoded = request.headers["transfer-encoding"] !== undefined;
  return {
    declaredBytes,
    hasBody: transferEncoded || (declaredBytes !== null && declaredBytes > 0),
    transferEncoded,
  };
}

export function assertDeclaredRequestBodyLimit(
  request: IncomingMessage,
  maxBytes = MAX_REQUEST_BODY_BYTES,
): void {
  const { declaredBytes } = requestBodyFraming(request);
  if (declaredBytes !== null && declaredBytes > maxBytes) {
    throw new RequestBodyTooLargeError(maxBytes);
  }
}

/**
 * Consume an inbound body once, enforcing the same ceiling for declared and
 * chunked transfers before a Web Request reaches route-level parsers.
 */
export async function readBoundedRequestBody(
  request: IncomingMessage,
  maxBytes = MAX_REQUEST_BODY_BYTES,
  timeoutMs = 120_000,
): Promise<Uint8Array | undefined> {
  assertDeclaredRequestBodyLimit(request, maxBytes);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      request.pause();
      reject(new RequestBodyTimeoutError(timeoutMs));
    }, timeoutMs);
  });
  const consume = async (): Promise<Uint8Array | undefined> => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    for await (const value of request.iterator({ destroyOnReturn: false })) {
      const chunk = Buffer.from(value);
      totalBytes += chunk.byteLength;
      if (totalBytes > maxBytes) {
        request.pause();
        throw new RequestBodyTooLargeError(maxBytes);
      }
      chunks.push(chunk);
    }
    return totalBytes > 0 ? Buffer.concat(chunks, totalBytes) : undefined;
  };

  try {
    return await Promise.race([consume(), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export type JsonObject = Record<string, unknown>;

export type JsonObjectReadResult =
  | { ok: true; value: JsonObject }
  | { ok: false; reason: "invalid_json" | "not_object" };

/**
 * Parses an HTTP JSON body without treating arrays, null, or primitives as
 * request DTOs. Route owners remain responsible for their field-level schema.
 */
export async function readJsonObjectBody(
  request: Request,
): Promise<JsonObjectReadResult> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    return { ok: false, reason: "invalid_json" };
  }

  return isPlainObject(value)
    ? { ok: true, value }
    : { ok: false, reason: "not_object" };
}

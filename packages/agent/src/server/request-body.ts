import { isPlainObject } from "@elizaos/shared/type-guards";

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

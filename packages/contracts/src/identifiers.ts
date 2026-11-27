/** Shared identifier vocabulary for every process boundary. */

/** Named bot IDs are stable lowercase host identifiers, never display names. */
export const BOT_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/u;

/** RFC 4122 UUID shape without constraining the generator version. */
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** UUIDs minted through `randomUUID` use version 4 and the RFC variant. */
export const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function isBotId(value: unknown): value is string {
  return typeof value === "string" && BOT_ID_PATTERN.test(value);
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function isUuidV4(value: unknown): value is string {
  return typeof value === "string" && UUID_V4_PATTERN.test(value);
}

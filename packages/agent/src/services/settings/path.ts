const SETTING_PATH_SEGMENT = /^[a-z][a-z0-9_-]*$/iu;
const UNSAFE_SETTING_SEGMENTS = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

const MAX_SETTING_PATH_LENGTH = 160;
const MAX_SETTING_PATH_DEPTH = 12;

/**
 * Parse a settings path at the ownership boundary shared by the API, CLI, and
 * settings service. Keeping this invariant in the service prevents non-HTTP
 * callers from creating ambiguous keys or traversing object prototypes.
 */
export function parseSettingPath(value: unknown): string[] {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_SETTING_PATH_LENGTH
  ) {
    throw new Error("Setting path is not valid.");
  }

  const segments = value.split(".");
  if (
    segments.length > MAX_SETTING_PATH_DEPTH ||
    segments.some(
      (segment) =>
        !SETTING_PATH_SEGMENT.test(segment) ||
        UNSAFE_SETTING_SEGMENTS.has(segment.toLowerCase()),
    )
  ) {
    throw new Error("Setting path is not valid.");
  }
  return segments;
}

export function isSafeSettingPath(value: unknown): value is string {
  try {
    parseSettingPath(value);
    return true;
  } catch {
    return false;
  }
}

export function setSettingPath(
  target: object,
  path: string,
  value: unknown,
): void {
  const segments = parseSettingPath(path);
  let current = target as Record<string, unknown>;

  for (const segment of segments.slice(0, -1)) {
    const next = current[segment];
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  }

  const leaf = segments.at(-1);
  if (!leaf) {
    throw new Error("Setting path is not valid.");
  }
  current[leaf] = value;
}

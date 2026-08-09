export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function fullyDecodeComponent(value: string): string | null {
  let decoded = value;
  try {
    for (let index = 0; index < 6; index += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) return decoded;
      decoded = next;
    }
    return null;
  } catch {
    return null;
  }
}

export function hasControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
  });
}

export function isSafeResourceId(segment: string | undefined): boolean {
  if (!segment || segment.length > 768) return false;
  const decoded = fullyDecodeComponent(segment);
  return Boolean(
    decoded &&
      decoded.length <= 256 &&
      decoded !== "." &&
      decoded !== ".." &&
      !decoded.includes("/") &&
      !decoded.includes("\\") &&
      !decoded.includes("?") &&
      !decoded.includes("#") &&
      !hasControlCharacters(decoded),
  );
}

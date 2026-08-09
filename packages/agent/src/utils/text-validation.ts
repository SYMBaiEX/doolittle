export function hasAsciiControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
  });
}

export function hasEncodedAsciiControlCharacters(
  value: string,
  maxDecodePasses = 6,
): boolean {
  if (!Number.isSafeInteger(maxDecodePasses) || maxDecodePasses < 1) {
    throw new RangeError("maxDecodePasses must be a positive integer.");
  }
  let decoded = value;
  for (let index = 0; index < maxDecodePasses; index += 1) {
    if (hasAsciiControlCharacters(decoded)) return true;
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) return false;
      decoded = next;
    } catch {
      return false;
    }
  }
  return hasAsciiControlCharacters(decoded);
}

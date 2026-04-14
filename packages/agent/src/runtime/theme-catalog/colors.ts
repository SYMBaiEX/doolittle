function parseHexColor(
  value: string,
): { r: number; g: number; b: number } | null {
  const normalized = value.trim();
  if (!normalized.startsWith("#")) {
    return null;
  }

  const hex = normalized.slice(1);
  if (hex.length === 3) {
    const [r, g, b] = hex.split("");
    if (!r || !g || !b) {
      return null;
    }
    return {
      r: Number.parseInt(r + r, 16),
      g: Number.parseInt(g + g, 16),
      b: Number.parseInt(b + b, 16),
    };
  }

  if (hex.length === 6) {
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
    };
  }

  return null;
}

export function getReadableTextColor(
  background: string,
  light = "white",
  dark = "black",
): string {
  const parsed = parseHexColor(background);
  if (!parsed) {
    return light;
  }

  const luminance =
    (0.2126 * parsed.r + 0.7152 * parsed.g + 0.0722 * parsed.b) / 255;
  return luminance > 0.62 ? dark : light;
}

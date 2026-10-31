function luminance(value: string): number | undefined {
  const color =
    value === "white"
      ? "#ffffff"
      : value === "black"
        ? "#000000"
        : value.trim();
  const match = /^#([a-f0-9]{3}|[a-f0-9]{6})$/iu.exec(color);
  if (!match) return undefined;
  const hex =
    match[1].length === 3 ? [...match[1]].map((c) => c + c).join("") : match[1];
  return [0, 2, 4]
    .map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4))
    .reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0);
}

/** Pick the higher WCAG contrast, rather than guessing from linear RGB brightness. */
export function getReadableTextColor(
  background: string,
  light = "white",
  dark = "black",
): string {
  const base = luminance(background);
  if (base === undefined) return light;
  const contrast = (text: string, fallback: number) => {
    const value = luminance(text) ?? fallback;
    return (Math.max(base, value) + 0.05) / (Math.min(base, value) + 0.05);
  };
  return contrast(light, 1) >= contrast(dark, 0) ? light : dark;
}

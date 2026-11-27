import { ellipsizeText } from "./terminal-presentation";

function compactJsonLine(value: unknown): string {
  const raw = JSON.stringify(value);
  return raw.length > 320 ? `${raw.slice(0, 317)}...` : raw;
}

export function truncate(text: string, max = 520): string {
  return ellipsizeText(text, max);
}

export function compactPreview(text: string): string {
  if (!text.trim().startsWith("{") && !text.trim().startsWith("[")) {
    return truncate(text, 320);
  }

  try {
    return compactJsonLine(JSON.parse(text) as unknown);
  } catch {
    return truncate(text, 320);
  }
}

import { asRecord } from "@elizaos/shared/type-guards";

const MAX_TEXT_LENGTH = 500;
export const MAX_URL_LENGTH = 2_048;

export function sanitizedText(
  value: unknown,
  maxLength = MAX_TEXT_LENGTH,
): string {
  if (typeof value !== "string") return "";
  return Array.from(value)
    .filter((character) => {
      const codePoint = character.codePointAt(0);
      return (
        codePoint !== undefined &&
        (codePoint === 9 || codePoint >= 32) &&
        !(codePoint >= 127 && codePoint <= 159) &&
        !/\p{Cf}/u.test(character)
      );
    })
    .join("")
    .trim()
    .slice(0, maxLength);
}

export function sanitizedOptionalText(
  value: unknown,
  maxLength = MAX_TEXT_LENGTH,
): string | undefined {
  const result = sanitizedText(value, maxLength);
  return result || undefined;
}

export function sanitizedDate(value: unknown): string | undefined {
  const text = sanitizedText(value, 64);
  if (!text) return undefined;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

export function sanitizedCount(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0;
}

export function sanitizedGithubUrl(value: unknown): string | undefined {
  const text = sanitizedText(value, MAX_URL_LENGTH);
  if (!text) return undefined;
  try {
    const url = new URL(text);
    if (
      url.protocol !== "https:" ||
      url.hostname.toLowerCase() !== "github.com" ||
      url.username ||
      url.password
    ) {
      return undefined;
    }
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

export function normalizedStatus(
  value: unknown,
): "queued" | "in_progress" | "completed" | "unknown" {
  const status = sanitizedText(value, 32).toLowerCase();
  if (status === "queued" || status === "pending" || status === "waiting") {
    return "queued";
  }
  if (status === "in_progress" || status === "in progress") {
    return "in_progress";
  }
  if (status === "completed" || status === "complete") return "completed";
  return "unknown";
}

export function parseJsonRecord(
  output: string,
): Record<string, unknown> | null {
  try {
    return asRecord(JSON.parse(output));
  } catch {
    return null;
  }
}

export function parseJsonArray(output: string): unknown[] | null {
  try {
    const value = JSON.parse(output);
    return Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

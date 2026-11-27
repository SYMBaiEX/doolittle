import { escapeBlessed } from "../render-utils";

const CONTROL_DECK_CHROME_WIDTH = 4;
const MIN_CONTROL_DECK_CONTENT_WIDTH = 8;

export function normalizeControlDeckWidth(width = 80): number {
  if (!Number.isFinite(width)) {
    return 80;
  }
  return Math.max(MIN_CONTROL_DECK_CONTENT_WIDTH, Math.floor(width));
}

export function clipControlDeckText(text: string, width: number): string {
  const normalized = text.replace(/\s+/gu, " ").trim();
  const target = Math.max(0, Math.floor(width));
  if (normalized.length <= target) {
    return normalized;
  }
  if (target === 0) {
    return "";
  }
  if (target === 1) {
    return "…";
  }
  return `${normalized.slice(0, target - 1)}…`;
}

export function clipControlDeckLine(text: string, width: number): string {
  const target = Math.max(0, Math.floor(width));
  if (text.length <= target) {
    return text;
  }
  if (target === 0) {
    return "";
  }
  if (target === 1) {
    return "…";
  }
  return `${text.slice(0, target - 1)}…`;
}

export function renderControlDeckHeading(
  label: string,
  compactLabel: string,
  width: number,
): string {
  const content =
    label.length <= width
      ? label
      : compactLabel.length <= width
        ? compactLabel
        : clipControlDeckText(label, width);
  return `{bold}${content}{/}`;
}

export function escapeControlDeckBlessed(text: string): string {
  return escapeBlessed(text);
}

function resolveOuterWidth(widgetWidth: unknown, screenWidth: number): number {
  if (typeof widgetWidth === "number" && Number.isFinite(widgetWidth)) {
    return widgetWidth;
  }
  if (typeof widgetWidth === "string") {
    const percent = /^(\d+(?:\.\d+)?)%(?:-(\d+))?$/u.exec(widgetWidth);
    if (percent) {
      const scaled = Math.floor(
        (screenWidth * Number.parseFloat(percent[1])) / 100,
      );
      return Math.max(0, scaled - Number.parseInt(percent[2] ?? "0", 10));
    }
    const numeric = Number.parseInt(widgetWidth, 10);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }
  return screenWidth;
}

export function resolveControlDeckContentWidth(
  widgetWidth: unknown,
  screenWidth: number,
): number {
  const outerWidth = resolveOuterWidth(widgetWidth, screenWidth);
  return normalizeControlDeckWidth(outerWidth - CONTROL_DECK_CHROME_WIDTH);
}

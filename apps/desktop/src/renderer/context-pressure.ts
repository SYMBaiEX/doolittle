export type ContextPressureTone = "neutral" | "warn" | "bad";

export interface ContextPressureSnapshot {
  estimatedTokens: number;
  contextWindowTokens: number;
  usageFraction: number;
  percent: number;
  overThreshold: boolean;
  estimated: true;
  sampledMessages: number;
  totalMessages: number;
  truncated: boolean;
  provider?: string;
  model?: string;
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function clampContextPercent(value: number): number {
  return Math.min(100, finiteNonNegative(value));
}

export function contextPressureTone(
  usageFraction: number,
): ContextPressureTone {
  const normalized = finiteNonNegative(usageFraction);
  if (normalized >= 0.85) return "bad";
  if (normalized >= 0.7) return "warn";
  return "neutral";
}

export function compactTokenCount(value: number): string {
  const normalized = finiteNonNegative(value);
  if (normalized >= 1_000_000) {
    return `${(normalized / 1_000_000).toFixed(normalized >= 10_000_000 ? 0 : 1).replace(/\.0$/u, "")}m`;
  }
  if (normalized >= 1_000) {
    return `${(normalized / 1_000).toFixed(normalized >= 100_000 ? 0 : 1).replace(/\.0$/u, "")}k`;
  }
  return Math.round(normalized).toLocaleString();
}

export function contextPressureLabel(context: ContextPressureSnapshot): string {
  return `${Math.round(clampContextPercent(context.percent))}% · ${compactTokenCount(
    context.estimatedTokens,
  )} / ${compactTokenCount(context.contextWindowTokens)}`;
}

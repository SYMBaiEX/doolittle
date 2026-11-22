import type { ReactNode } from "react";

export interface CompactStat {
  detail?: ReactNode;
  label: string;
  tone?: "neutral" | "good" | "warn" | "bad";
  value: ReactNode;
}

const STAT_TONE_CLASS_NAMES = {
  neutral: "text-[var(--text)]",
  good: "text-[var(--good)]",
  warn: "text-[var(--warn)]",
  bad: "text-[var(--bad)]",
} as const;

export function CompactStatStrip({
  label,
  stats,
}: {
  label: string;
  stats: readonly CompactStat[];
}) {
  return (
    <section
      aria-label={label}
      className="compact-stat-strip grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,120px),1fr))] items-start gap-x-4 gap-y-3"
    >
      {stats.map((stat) => (
        <div
          className="compact-stat-strip__item grid min-w-0 gap-0.5 py-1"
          key={stat.label}
        >
          <span
            className="min-w-0 text-[length:var(--text-meta)] leading-snug text-[var(--muted)] [overflow-wrap:anywhere]"
            title={stat.label}
          >
            {stat.label}
          </span>
          <strong
            className={`truncate text-base leading-tight tabular-nums ${STAT_TONE_CLASS_NAMES[stat.tone ?? "neutral"]}`}
            title={
              typeof stat.value === "string" || typeof stat.value === "number"
                ? String(stat.value)
                : undefined
            }
          >
            {stat.value}
          </strong>
          {stat.detail ? (
            <small
              className="text-[length:var(--text-meta)] leading-snug text-[var(--text-soft)] [overflow-wrap:anywhere]"
              title={
                typeof stat.detail === "string" ||
                typeof stat.detail === "number"
                  ? String(stat.detail)
                  : undefined
              }
            >
              {stat.detail}
            </small>
          ) : null}
        </div>
      ))}
    </section>
  );
}

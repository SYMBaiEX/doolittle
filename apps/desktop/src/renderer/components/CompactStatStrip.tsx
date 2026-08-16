import type { ReactNode } from "react";

export interface CompactStat {
  detail?: ReactNode;
  label: string;
  tone?: "neutral" | "good" | "warn" | "bad";
  value: ReactNode;
}

const STAT_TONE_CLASS_NAMES = {
  neutral: "bg-transparent",
  good: "bg-[var(--good)]",
  warn: "bg-[var(--warn)]",
  bad: "bg-[var(--bad)]",
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
      className="compact-stat-strip grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] overflow-hidden border-y border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_78%,transparent)] max-[960px]:grid-cols-2 max-[540px]:grid-cols-1"
    >
      {stats.map((stat) => (
        <div
          className="compact-stat-strip__item relative grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5 border-r border-[var(--border)] px-[13px] py-2.5 last:border-r-0 max-[960px]:even:border-r-0 max-[960px]:[&:nth-child(n+3)]:border-t max-[540px]:border-r-0 max-[540px]:border-t max-[540px]:first:border-t-0"
          key={stat.label}
        >
          <i
            aria-hidden="true"
            className={`absolute inset-y-[9px] left-0 w-0.5 ${STAT_TONE_CLASS_NAMES[stat.tone ?? "neutral"]}`}
          />
          <span
            className="min-w-0 truncate font-[var(--font-mono)] text-[length:var(--text-meta)] tracking-[0.07em] text-[var(--muted)] uppercase"
            title={stat.label}
          >
            {stat.label}
          </span>
          <strong
            className="truncate font-[var(--font-display)] text-sm tracking-[-0.015em] text-[var(--text)]"
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
              className="col-span-full truncate text-[length:var(--text-meta)] text-[var(--text-soft)]"
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

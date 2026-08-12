import type { ReactNode } from "react";
import "./compact-stat-strip.css";

export interface CompactStat {
  detail?: ReactNode;
  label: string;
  tone?: "neutral" | "good" | "warn" | "bad";
  value: ReactNode;
}

export function CompactStatStrip({
  label,
  stats,
}: {
  label: string;
  stats: readonly CompactStat[];
}) {
  return (
    <section aria-label={label} className="compact-stat-strip">
      {stats.map((stat) => (
        <div
          className={`compact-stat-strip__item is-${stat.tone ?? "neutral"}`}
          key={stat.label}
        >
          <span title={stat.label}>{stat.label}</span>
          <strong
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

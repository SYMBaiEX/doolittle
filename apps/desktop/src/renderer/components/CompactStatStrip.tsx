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
          <span>{stat.label}</span>
          <strong>{stat.value}</strong>
          {stat.detail ? <small>{stat.detail}</small> : null}
        </div>
      ))}
    </section>
  );
}

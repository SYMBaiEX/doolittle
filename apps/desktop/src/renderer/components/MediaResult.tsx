import { formatBoundedPreview, type UnknownRecord } from "../lib";
import { MEDIA_HEADING_CLASS } from "../media/media-layout";

export const MEDIA_RESULT_CHARACTER_LIMIT = 2_400;

export function MediaResult({
  eyebrow,
  result,
  title,
}: {
  eyebrow: string;
  result: UnknownRecord;
  title: string;
}) {
  return (
    <section className="min-h-full min-w-0 rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[color-mix(in_srgb,var(--surface-raised)_82%,var(--surface))] p-[var(--card-pad)]">
      <div className={MEDIA_HEADING_CLASS}>
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
        </div>
      </div>
      <pre
        aria-live="polite"
        className="m-0 max-h-[360px] min-h-[180px] max-w-full overflow-auto rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--border)_88%,var(--accent))] bg-[color-mix(in_srgb,var(--bg)_84%,transparent)] p-[13px] text-[length:var(--text-meta)] leading-[1.55] whitespace-pre-wrap text-[var(--text-soft)] [overflow-wrap:anywhere] [scrollbar-gutter:stable]"
      >
        {formatBoundedPreview(result, MEDIA_RESULT_CHARACTER_LIMIT)}
      </pre>
    </section>
  );
}

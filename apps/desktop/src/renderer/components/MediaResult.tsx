import { formatBoundedPreview, type UnknownRecord } from "../lib";

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
    <section className="content-card media-result">
      <div className="card-heading">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
        </div>
      </div>
      <pre className="json-preview" aria-live="polite">
        {formatBoundedPreview(result, MEDIA_RESULT_CHARACTER_LIMIT)}
      </pre>
    </section>
  );
}

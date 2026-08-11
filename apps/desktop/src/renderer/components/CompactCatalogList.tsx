import { useState } from "react";
import { Badge } from "../lib";
import "./compact-catalog-list.css";

export interface CompactCatalogFact {
  label: string;
  value: string;
}

export interface CompactCatalogEntry {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  status: string;
  tone: "neutral" | "good" | "warn" | "bad";
  code?: string;
  meta?: string;
  facts?: CompactCatalogFact[];
}

export function CompactCatalogList({
  ariaLabel,
  entries,
  pageSize = 24,
  resetKey,
}: {
  ariaLabel: string;
  entries: CompactCatalogEntry[];
  pageSize?: number;
  resetKey: string;
}) {
  const [page, setPage] = useState({ key: resetKey, limit: pageSize });
  const limit = page.key === resetKey ? page.limit : pageSize;
  const visible = entries.slice(0, limit);
  const remaining = Math.max(0, entries.length - visible.length);

  return (
    <section aria-label={ariaLabel} className="compact-catalog">
      <ul className="compact-catalog__list">
        {visible.map((entry) => (
          <li className="compact-catalog__row" key={entry.id}>
            <div className="compact-catalog__main">
              <div className="compact-catalog__copy">
                <div className="compact-catalog__title">
                  <span className="eyebrow">{entry.eyebrow}</span>
                  <strong>{entry.title}</strong>
                </div>
                <p>{entry.description}</p>
                {entry.code || entry.meta || entry.facts?.length ? (
                  <div className="compact-catalog__meta">
                    {entry.code ? <code>{entry.code}</code> : null}
                    {entry.meta ? <span>{entry.meta}</span> : null}
                    {entry.facts?.length ? (
                      <details className="compact-catalog__details">
                        <summary>Details</summary>
                        <dl>
                          {entry.facts.map((fact) => (
                            <div key={`${entry.id}:${fact.label}`}>
                              <dt>{fact.label}</dt>
                              <dd>{fact.value}</dd>
                            </div>
                          ))}
                        </dl>
                      </details>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <Badge tone={entry.tone}>{entry.status}</Badge>
            </div>
          </li>
        ))}
      </ul>
      {remaining ? (
        <footer className="compact-catalog__footer">
          <span>
            Showing {visible.length} of {entries.length}
          </span>
          <button
            className="secondary-button"
            onClick={() => setPage({ key: resetKey, limit: limit + pageSize })}
            type="button"
          >
            Show {Math.min(pageSize, remaining)} more
          </button>
        </footer>
      ) : null}
    </section>
  );
}

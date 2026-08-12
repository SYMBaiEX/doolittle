import { type ReactNode, useState } from "react";
import { Badge } from "../lib";
import "./compact-catalog-list.css";
import { progressiveWindow } from "./progressive-window";

export const DEFAULT_CATALOG_PAGE_SIZE = 12;

export function catalogExceptionStatus(
  healthy: boolean,
  exceptionLabel: string,
): Pick<CompactCatalogEntry, "status" | "tone"> {
  return healthy
    ? { status: undefined, tone: undefined }
    : { status: exceptionLabel, tone: "warn" };
}

export interface CompactCatalogFact {
  label: string;
  value: string;
}

export interface CompactCatalogEntry {
  id: string;
  eyebrow?: string;
  title: string;
  description: string;
  descriptionMode?: "inline" | "details";
  status?: string;
  tone?: "neutral" | "good" | "warn" | "bad";
  code?: string;
  meta?: string;
  facts?: CompactCatalogFact[];
  detailsLabel?: string;
  detailsNote?: string;
  action?: ReactNode;
}

export function CompactCatalogList({
  ariaLabel,
  entries,
  pageSize = DEFAULT_CATALOG_PAGE_SIZE,
  resetKey,
}: {
  ariaLabel: string;
  entries: CompactCatalogEntry[];
  pageSize?: number;
  resetKey: string;
}) {
  const [page, setPage] = useState({ key: resetKey, limit: pageSize });
  const requested = page.key === resetKey ? page.limit : pageSize;
  const { limit, remaining, visible } = progressiveWindow(entries, {
    pageSize,
    requested,
  });

  return (
    <section aria-label={ariaLabel} className="compact-catalog">
      <ul className="compact-catalog__list">
        {visible.map((entry) => (
          <li className="compact-catalog__row" key={entry.id}>
            <div className="compact-catalog__main">
              <div className="compact-catalog__copy">
                <div className="compact-catalog__title">
                  {entry.eyebrow ? (
                    <span className="eyebrow">{entry.eyebrow}</span>
                  ) : null}
                  <strong>{entry.title}</strong>
                </div>
                <div className="compact-catalog__summary">
                  {entry.descriptionMode !== "details" ? (
                    <p title={entry.description}>{entry.description}</p>
                  ) : null}
                  {entry.code || entry.meta ? (
                    <span className="compact-catalog__meta">
                      {entry.code ? <code>{entry.code}</code> : null}
                      {entry.meta ? <span>{entry.meta}</span> : null}
                    </span>
                  ) : null}
                  {entry.descriptionMode === "details" ||
                  entry.facts?.length ? (
                    <details className="compact-catalog__details">
                      <summary>{entry.detailsLabel ?? "Details"}</summary>
                      {entry.descriptionMode === "details" ? (
                        <p className="compact-catalog__details-description">
                          {entry.description}
                        </p>
                      ) : null}
                      {entry.facts?.length ? (
                        <dl>
                          {entry.facts.map((fact) => (
                            <div key={`${entry.id}:${fact.label}`}>
                              <dt>{fact.label}</dt>
                              <dd>{fact.value}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : null}
                      {entry.detailsNote ? <p>{entry.detailsNote}</p> : null}
                    </details>
                  ) : null}
                </div>
              </div>
              <div className="compact-catalog__actions">
                {entry.status ? (
                  <Badge tone={entry.tone}>{entry.status}</Badge>
                ) : null}
                {entry.action}
              </div>
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

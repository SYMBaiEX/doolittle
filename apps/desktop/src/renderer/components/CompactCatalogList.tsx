import { Button } from "@elizaos/ui/components/ui/button";
import { ChevronRight } from "lucide-react";
import { Fragment, type ReactNode, useState } from "react";
import { Badge } from "../lib";
import { progressiveWindow } from "./progressive-window";
import { UiIcon } from "./UiIcon";

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
  group?: string;
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
    <section
      aria-label={ariaLabel}
      className="overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_94%,transparent)]"
    >
      <ul className="m-0 list-none p-0">
        {visible.map((entry, index) => (
          <Fragment key={entry.id}>
            {entry.group && visible[index - 1]?.group !== entry.group ? (
              <li
                className="border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--surface-soft)_72%,transparent)] px-2.5 pt-[5px] pb-1 [&:not(:first-child)]:border-t"
                data-catalog-group="true"
              >
                <h3 className="m-0 font-[var(--font-mono)] text-[length:var(--text-meta)] font-semibold uppercase leading-[1.4] tracking-[0.1em] text-[var(--accent)]">
                  {entry.group}
                </h3>
              </li>
            ) : null}
            <li
              className="border-b border-[var(--border)] px-2.5 py-[7px]"
              data-catalog-row="true"
            >
              <div className="flex min-w-0 items-center justify-between gap-4 max-[700px]:items-start">
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <div className="flex min-w-0 items-baseline gap-2.5 max-[700px]:flex-col max-[700px]:items-start max-[700px]:gap-[3px]">
                    {entry.eyebrow ? (
                      <span className="shrink-0 font-[var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">
                        {entry.eyebrow}
                      </span>
                    ) : null}
                    <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-[length:var(--text-control)] max-[700px]:overflow-visible max-[700px]:whitespace-normal">
                      {entry.title}
                    </strong>
                  </div>
                  <div
                    className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-0.5"
                    data-catalog-summary="true"
                  >
                    {entry.descriptionMode !== "details" ? (
                      <p
                        className="m-0 min-w-48 flex-[1_1_22rem] overflow-hidden text-ellipsis whitespace-nowrap text-[length:var(--text-meta)] leading-[1.4] text-[var(--text-soft)] max-[700px]:overflow-visible max-[700px]:whitespace-normal"
                        title={entry.description}
                      >
                        {entry.description}
                      </p>
                    ) : null}
                    {entry.code || entry.meta ? (
                      <span className="flex min-w-0 flex-[0_1_auto] items-center gap-[7px] font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--muted)] [&>*]:overflow-hidden [&>*]:text-ellipsis [&>*]:whitespace-nowrap max-[700px]:[&>*]:overflow-visible max-[700px]:[&>*]:whitespace-normal">
                        {entry.code ? <code>{entry.code}</code> : null}
                        {entry.meta ? <span>{entry.meta}</span> : null}
                      </span>
                    ) : null}
                    {entry.descriptionMode === "details" ||
                    entry.facts?.length ? (
                      <details className="group min-w-0 open:basis-full">
                        <summary className="cursor-pointer list-none p-0 font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--muted)] [&::-webkit-details-marker]:hidden">
                          <UiIcon
                            className="mr-[7px] inline-block text-[var(--accent)] transition-transform group-open:rotate-90 motion-reduce:transition-none"
                            icon={ChevronRight}
                            size="xs"
                          />
                          {entry.detailsLabel ?? "Details"}
                        </summary>
                        {entry.descriptionMode === "details" ? (
                          <p
                            className="mt-[7px] rounded-[var(--radius-sm)] border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface-soft)_76%,transparent)] px-2.5 py-2 text-[length:var(--text-meta)] leading-[1.45] text-[var(--text-soft)]"
                            data-catalog-details-description="true"
                          >
                            {entry.description}
                          </p>
                        ) : null}
                        {entry.facts?.length ? (
                          <dl className="mt-[7px] grid gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface-soft)_76%,transparent)] px-2.5 py-[9px]">
                            {entry.facts.map((fact) => (
                              <div
                                className="grid grid-cols-[86px_minmax(0,1fr)] gap-2.5"
                                key={`${entry.id}:${fact.label}`}
                              >
                                <dt className="font-[var(--font-mono)] text-[length:var(--text-meta)] uppercase text-[var(--muted)]">
                                  {fact.label}
                                </dt>
                                <dd className="m-0 min-w-0 text-[length:var(--text-meta)] text-[var(--text-soft)] [overflow-wrap:anywhere]">
                                  {fact.value}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        ) : null}
                        {entry.detailsNote ? (
                          <p className="mt-[7px] text-[length:var(--text-meta)] leading-[1.45] text-[var(--muted)]">
                            {entry.detailsNote}
                          </p>
                        ) : null}
                      </details>
                    ) : null}
                  </div>
                </div>
                <div
                  className="flex shrink-0 items-center gap-2 [&>button]:min-h-7 [&>button]:px-[9px] max-[700px]:flex-col max-[700px]:items-end"
                  data-catalog-actions="true"
                >
                  {entry.status ? (
                    <Badge tone={entry.tone}>{entry.status}</Badge>
                  ) : null}
                  {entry.action}
                </div>
              </div>
            </li>
          </Fragment>
        ))}
      </ul>
      {remaining ? (
        <footer className="flex items-center justify-between gap-3 bg-[color-mix(in_srgb,var(--surface-soft)_66%,transparent)] px-2.5 py-[7px]">
          <span className="font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--muted)]">
            Showing {visible.length} of {entries.length}
          </span>
          <Button
            onClick={() => setPage({ key: resetKey, limit: limit + pageSize })}
            size="sm"
            type="button"
            variant="outline"
          >
            Show {Math.min(pageSize, remaining)} more
          </Button>
        </footer>
      ) : null}
    </section>
  );
}

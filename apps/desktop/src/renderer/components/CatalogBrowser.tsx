import { type ContextAction, ContextActionMenu } from "@doolittle/ui";
import { ChevronRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { UiIcon } from "./UiIcon";
import {
  type CatalogBrowserItem,
  useCatalogBrowser,
} from "./useCatalogBrowser";
import { WorkbenchAction } from "./workbench/Workbench";
import "./catalog-browser.css";

type CatalogTone = "neutral" | "good" | "warn";
type CatalogRow = {
  title: string;
  menuRevision?: string;
  meta: ReactNode;
  status?: ReactNode;
};

export function CatalogBrowser<T extends CatalogBrowserItem>({
  children,
  getActions,
  getRow,
  icon,
  idPrefix,
  items,
  label,
  listLabel,
  pageSize,
  resetKey,
}: {
  children: (selected: T) => ReactNode;
  getActions?: (item: T, select: () => void) => readonly ContextAction[];
  getRow: (item: T) => CatalogRow;
  icon: LucideIcon;
  idPrefix: string;
  items: readonly T[];
  label: string;
  listLabel: string;
  pageSize: number;
  resetKey: string;
}) {
  const {
    handleKeyDown,
    itemId,
    listRef,
    panelId,
    selected,
    selectedIndex,
    selectAt,
    showMore,
    window,
  } = useCatalogBrowser({ idPrefix, items, pageSize, resetKey });

  if (!selected) return null;
  return (
    <section aria-label={label} className="catalog-browser">
      <aside className="catalog-browser-index">
        <div className="catalog-browser-index__heading">
          <span>{listLabel}</span>
        </div>
        <div
          aria-label={listLabel}
          aria-orientation="vertical"
          className="catalog-browser-index__list"
          ref={listRef}
          role="tablist"
        >
          {window.visible.map((item, index) => {
            const row = getRow(item);
            const active = selected.id === item.id;
            const select = () => selectAt(index, false);
            const tab = (
              <button
                aria-controls={panelId}
                aria-selected={active}
                className="catalog-browser-item"
                id={itemId(index)}
                key={item.id}
                onClick={select}
                onKeyDown={(event) => handleKeyDown(event, index)}
                role="tab"
                tabIndex={active ? 0 : -1}
                type="button"
              >
                <span className="catalog-browser__glyph">
                  <UiIcon icon={icon} size="md" />
                </span>
                <span className="catalog-browser-item__copy">
                  <strong title={row.title}>{row.title}</strong>
                  <span className="catalog-browser-item__meta">{row.meta}</span>
                </span>
                {row.status ?? (
                  <UiIcon
                    className="catalog-browser-item__disclosure"
                    icon={ChevronRight}
                    size="xs"
                  />
                )}
              </button>
            );
            return getActions ? (
              <ContextActionMenu
                items={getActions(item, select)}
                key={item.id}
                label={`${row.title} actions`}
                scopeKey={`${idPrefix}:${resetKey}:${item.id}:${row.menuRevision ?? ""}`}
              >
                {tab}
              </ContextActionMenu>
            ) : (
              tab
            );
          })}
        </div>
        {window.remaining ? (
          <footer className="catalog-browser-index__footer">
            <span>
              {window.visible.length} of {items.length}
            </span>
            <WorkbenchAction emphasis="quiet" onClick={showMore} size="sm">
              Show {Math.min(pageSize, window.remaining)} more
            </WorkbenchAction>
          </footer>
        ) : null}
      </aside>
      <div
        aria-labelledby={itemId(selectedIndex)}
        className="catalog-browser-detail"
        id={panelId}
        role="tabpanel"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Read-only details need keyboard focus for scrolling.
        tabIndex={0}
      >
        {children(selected)}
      </div>
    </section>
  );
}

export function CatalogDetail({
  description,
  icon,
  name,
  status,
}: {
  description: ReactNode;
  icon: LucideIcon;
  name: string;
  status?: ReactNode;
}) {
  return (
    <header className="catalog-detail-heading">
      <div className="catalog-detail-heading__main">
        <span className="catalog-browser__glyph catalog-browser__glyph--detail">
          <UiIcon icon={icon} size="lg" />
        </span>
        <h3>{name}</h3>
        {status}
      </div>
      <p>{description}</p>
    </header>
  );
}

export function CatalogStatus({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: CatalogTone;
}) {
  return (
    <span className="catalog-status" data-tone={tone}>
      {children}
    </span>
  );
}

export function CatalogPolicy({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <div className="catalog-policy" role="note">
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}

export function CatalogFacts({
  facts,
}: {
  facts: readonly { label: string; value: ReactNode }[];
}) {
  return (
    <dl className="catalog-facts">
      {facts.map(({ label, value }) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

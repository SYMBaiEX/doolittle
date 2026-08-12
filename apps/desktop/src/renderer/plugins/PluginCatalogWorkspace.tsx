import "../components/catalog-browser.css";
import { useCatalogBrowser } from "../components/useCatalogBrowser";
import { Badge, titleCase } from "../lib";
import type { PluginCatalogItem } from "./plugin-catalog-model";

export const PLUGIN_CATALOG_PAGE_SIZE = 12;

export function PluginCatalogWorkspace({
  entries,
  resetKey,
}: {
  entries: readonly PluginCatalogItem[];
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
  } = useCatalogBrowser({
    idPrefix: "plugin",
    items: entries,
    pageSize: PLUGIN_CATALOG_PAGE_SIZE,
    resetKey,
  });

  if (!selected) return null;

  return (
    <section
      aria-label="Runtime plugin catalog"
      className="catalog-browser plugin-catalog-workspace"
    >
      <aside className="catalog-browser__index">
        <header className="catalog-browser__index-header">
          <div>
            <span className="eyebrow">Plugin index</span>
            <strong>Browse runtime</strong>
          </div>
          <small>{entries.length} matches</small>
        </header>
        <div
          aria-label="Plugins"
          aria-orientation="vertical"
          className="catalog-browser__index-list"
          ref={listRef}
          role="tablist"
        >
          {window.visible.map((item, index) => {
            const active = item.id === selected.id;
            return (
              <button
                key={item.id}
                aria-controls={panelId}
                aria-selected={active}
                className={`catalog-browser__index-item${active ? " is-selected" : ""}`}
                id={itemId(index)}
                onClick={() => selectAt(index, false)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                role="tab"
                tabIndex={active ? 0 : -1}
                type="button"
              >
                <span className="catalog-browser__index-title">
                  <strong>{item.title}</strong>
                  {!item.enabled ? <Badge tone="warn">Inactive</Badge> : null}
                </span>
                <span className="catalog-browser__index-meta">
                  <span>{titleCase(item.category)}</span>
                  <span>{titleCase(item.maturity)}</span>
                </span>
              </button>
            );
          })}
        </div>
        {window.remaining ? (
          <footer className="catalog-browser__index-footer">
            <span>
              {window.visible.length} of {entries.length}
            </span>
            <button
              className="secondary-button"
              onClick={showMore}
              type="button"
            >
              Show {Math.min(PLUGIN_CATALOG_PAGE_SIZE, window.remaining)} more
            </button>
          </footer>
        ) : null}
      </aside>
      <article
        aria-labelledby={itemId(selectedIndex)}
        className="catalog-browser__detail"
        id={panelId}
        role="tabpanel"
      >
        <header className="catalog-browser__detail-header">
          <div>
            <span className="eyebrow">Plugin detail</span>
            <h2>{selected.title}</h2>
            <p>{selected.description}</p>
          </div>
          <Badge tone={selected.enabled ? "good" : "warn"}>
            {selected.enabled ? "Enabled" : "Inactive"}
          </Badge>
        </header>
        {!selected.enabled ? (
          <div className="catalog-browser__callout" role="note">
            <strong>Runtime configuration</strong>
            <span>
              This package is part of the native catalog but is not loaded by
              the current local configuration.
            </span>
          </div>
        ) : null}
        <dl className="catalog-browser__facts">
          <div>
            <dt>Package</dt>
            <dd>
              <code>{selected.packageName}</code>
            </dd>
          </div>
          <div>
            <dt>Plugin ID</dt>
            <dd>
              <code>{selected.id}</code>
            </dd>
          </div>
          <div>
            <dt>Category</dt>
            <dd>{titleCase(selected.category)}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>{titleCase(selected.source)}</dd>
          </div>
          <div>
            <dt>Kind</dt>
            <dd>{titleCase(selected.kind)}</dd>
          </div>
          <div>
            <dt>Maturity</dt>
            <dd>{titleCase(selected.maturity)}</dd>
          </div>
          <div>
            <dt>Persistence</dt>
            <dd>{titleCase(selected.persistence)}</dd>
          </div>
        </dl>
      </article>
    </section>
  );
}

import { Button } from "@elizaos/ui/components/ui/button";
import {
  CATALOG_BROWSER_CLASS,
  CATALOG_CALLOUT_CLASS,
  CATALOG_DETAIL_CLASS,
  CATALOG_DETAIL_HEADER_CLASS,
  CATALOG_EYEBROW_CLASS,
  CATALOG_FACTS_CLASS,
  CATALOG_INDEX_CLASS,
  CATALOG_INDEX_FOOTER_CLASS,
  CATALOG_INDEX_HEADER_CLASS,
  CATALOG_INDEX_LIST_CLASS,
  CATALOG_INDEX_META_CLASS,
  CATALOG_INDEX_TITLE_CLASS,
  catalogIndexItemClass,
} from "../components/catalog-browser-layout";
import { useCatalogBrowser } from "../components/useCatalogBrowser";
import { Badge, titleCase } from "../lib";
import type { PluginCatalogItem } from "./plugin-catalog-model";

export const PLUGIN_CATALOG_PAGE_SIZE = 8;

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
      className={`plugin-catalog-workspace min-[821px]:h-[clamp(380px,42vh,500px)] ${CATALOG_BROWSER_CLASS}`}
    >
      <aside className={CATALOG_INDEX_CLASS}>
        <header className={CATALOG_INDEX_HEADER_CLASS}>
          <div>
            <span className={CATALOG_EYEBROW_CLASS}>Plugin index</span>
            <strong>Browse runtime</strong>
          </div>
          <small>{entries.length} matches</small>
        </header>
        <div
          aria-label="Plugins"
          aria-orientation="vertical"
          className={CATALOG_INDEX_LIST_CLASS}
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
                className={catalogIndexItemClass(active)}
                id={itemId(index)}
                onClick={() => selectAt(index, false)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                role="tab"
                tabIndex={active ? 0 : -1}
                type="button"
              >
                <span className={CATALOG_INDEX_TITLE_CLASS}>
                  <strong>{item.title}</strong>
                  {!item.enabled ? <Badge tone="warn">Inactive</Badge> : null}
                </span>
                <span className={CATALOG_INDEX_META_CLASS}>
                  <span>{titleCase(item.category)}</span>
                  <span>{titleCase(item.maturity)}</span>
                </span>
              </button>
            );
          })}
        </div>
        {window.remaining ? (
          <footer className={CATALOG_INDEX_FOOTER_CLASS}>
            <span>
              {window.visible.length} of {entries.length}
            </span>
            <Button
              onClick={showMore}
              size="sm"
              type="button"
              variant="outline"
            >
              Show {Math.min(PLUGIN_CATALOG_PAGE_SIZE, window.remaining)} more
            </Button>
          </footer>
        ) : null}
      </aside>
      <article
        aria-labelledby={itemId(selectedIndex)}
        className={CATALOG_DETAIL_CLASS}
        id={panelId}
        role="tabpanel"
      >
        <header className={CATALOG_DETAIL_HEADER_CLASS}>
          <div>
            <span className={CATALOG_EYEBROW_CLASS}>Plugin detail</span>
            <h2>{selected.title}</h2>
            <p>{selected.description}</p>
          </div>
          <Badge tone={selected.enabled ? "good" : "warn"}>
            {selected.enabled ? "Enabled" : "Inactive"}
          </Badge>
        </header>
        {!selected.enabled ? (
          <div className={CATALOG_CALLOUT_CLASS} role="note">
            <strong>Runtime configuration</strong>
            <span>
              This package is part of the native catalog but is not loaded by
              the current local configuration.
            </span>
          </div>
        ) : null}
        <dl
          className={`catalog-browser__facts ${CATALOG_FACTS_CLASS} grid-cols-2 gap-x-[22px] max-[1180px]:grid-cols-1`}
        >
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

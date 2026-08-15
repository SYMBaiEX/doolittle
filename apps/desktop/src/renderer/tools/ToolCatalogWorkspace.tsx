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
  CATALOG_TOKENS_CLASS,
  catalogIndexItemClass,
} from "../components/catalog-browser-layout";
import { useCatalogBrowser } from "../components/useCatalogBrowser";
import { Badge, titleCase, type UnknownRecord } from "../lib";
import { buildToolCatalogItems } from "./tool-catalog-model";

export const TOOL_CATALOG_PAGE_SIZE = 12;

function displayTransport(transport: string): string {
  const normalized = transport.toLowerCase();
  return normalized === "mcp" || normalized === "acp"
    ? normalized.toUpperCase()
    : titleCase(transport);
}

export function ToolCatalogWorkspace({
  entries,
  resetKey,
}: {
  entries: readonly UnknownRecord[];
  resetKey: string;
}) {
  const items = buildToolCatalogItems([...entries]);
  const {
    handleKeyDown,
    itemId,
    listRef,
    panelId,
    selected,
    selectedIndex,
    selectAt,
    showMore,
    window: toolWindow,
  } = useCatalogBrowser({
    idPrefix: "tool",
    items,
    pageSize: TOOL_CATALOG_PAGE_SIZE,
    resetKey,
  });

  if (!selected) return null;

  return (
    <section
      aria-label="Runtime tool catalog"
      className={CATALOG_BROWSER_CLASS}
    >
      <aside className={CATALOG_INDEX_CLASS}>
        <header className={CATALOG_INDEX_HEADER_CLASS}>
          <div>
            <span className={CATALOG_EYEBROW_CLASS}>Tool index</span>
            <strong>Browse capabilities</strong>
          </div>
          <small>{items.length} matches</small>
        </header>
        <div
          aria-label="Tools"
          aria-orientation="vertical"
          className={CATALOG_INDEX_LIST_CLASS}
          ref={listRef}
          role="tablist"
        >
          {toolWindow.visible.map((item, index) => {
            const active = item.id === selected.id;
            const tabId = itemId(index);
            return (
              <button
                key={item.id}
                aria-controls={panelId}
                aria-selected={active}
                className={catalogIndexItemClass(active)}
                id={tabId}
                onClick={() => selectAt(index, false)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                role="tab"
                tabIndex={active ? 0 : -1}
                type="button"
              >
                <span className={CATALOG_INDEX_TITLE_CLASS}>
                  <strong>{item.title}</strong>
                  {!item.enabled ? <Badge tone="warn">Disabled</Badge> : null}
                </span>
                <span className={CATALOG_INDEX_META_CLASS}>
                  <code>{item.id}</code>
                  <span>{titleCase(item.category)}</span>
                  {item.transport.toLowerCase() !== "native" ? (
                    <span>{displayTransport(item.transport)}</span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
        {toolWindow.remaining ? (
          <footer className={CATALOG_INDEX_FOOTER_CLASS}>
            <span>
              {toolWindow.visible.length} of {items.length}
            </span>
            <Button
              onClick={showMore}
              size="sm"
              type="button"
              variant="outline"
            >
              Show {Math.min(TOOL_CATALOG_PAGE_SIZE, toolWindow.remaining)} more
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
            <span className={CATALOG_EYEBROW_CLASS}>Tool detail</span>
            <h2>{selected.title}</h2>
            <p>{selected.description}</p>
          </div>
          <Badge tone={selected.enabled ? "good" : "warn"}>
            {selected.enabled ? "Available" : "Disabled"}
          </Badge>
        </header>
        {!selected.enabled && selected.policyReason ? (
          <div className={CATALOG_CALLOUT_CLASS} role="note">
            <strong>Profile policy</strong>
            <span>{selected.policyReason}</span>
          </div>
        ) : null}
        <dl className={CATALOG_FACTS_CLASS}>
          <div>
            <dt>Tool ID</dt>
            <dd>
              <code>{selected.id}</code>
            </dd>
          </div>
          <div>
            <dt>Category</dt>
            <dd>{titleCase(selected.category)}</dd>
          </div>
          <div>
            <dt>Transport</dt>
            <dd>{displayTransport(selected.transport)}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>{titleCase(selected.source)}</dd>
          </div>
          <div>
            <dt>Profiles</dt>
            <dd>
              {selected.allowedProfiles.length
                ? selected.allowedProfiles.map(titleCase).join(" · ")
                : "Runtime default"}
            </dd>
          </div>
        </dl>
        {selected.aliases.length ? (
          <section
            aria-labelledby={`${panelId}-aliases`}
            className={CATALOG_TOKENS_CLASS}
          >
            <span className={CATALOG_EYEBROW_CLASS} id={`${panelId}-aliases`}>
              Invoked as
            </span>
            <div>
              {selected.aliases.map((alias) => (
                <code key={alias}>{alias}</code>
              ))}
            </div>
          </section>
        ) : null}
      </article>
    </section>
  );
}

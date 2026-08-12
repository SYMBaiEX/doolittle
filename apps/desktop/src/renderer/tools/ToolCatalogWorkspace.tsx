import "../components/catalog-browser.css";
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
      className="catalog-browser tool-catalog-workspace"
    >
      <aside className="catalog-browser__index">
        <header className="catalog-browser__index-header">
          <div>
            <span className="eyebrow">Tool index</span>
            <strong>Browse capabilities</strong>
          </div>
          <small>{items.length} matches</small>
        </header>
        <div
          aria-label="Tools"
          aria-orientation="vertical"
          className="catalog-browser__index-list"
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
                className={`catalog-browser__index-item${active ? " is-selected" : ""}`}
                id={tabId}
                onClick={() => selectAt(index, false)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                role="tab"
                tabIndex={active ? 0 : -1}
                type="button"
              >
                <span className="catalog-browser__index-title">
                  <strong>{item.title}</strong>
                  {!item.enabled ? <Badge tone="warn">Disabled</Badge> : null}
                </span>
                <span className="catalog-browser__index-meta">
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
          <footer className="catalog-browser__index-footer">
            <span>
              {toolWindow.visible.length} of {items.length}
            </span>
            <button
              className="secondary-button"
              onClick={showMore}
              type="button"
            >
              Show {Math.min(TOOL_CATALOG_PAGE_SIZE, toolWindow.remaining)} more
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
            <span className="eyebrow">Tool detail</span>
            <h2>{selected.title}</h2>
            <p>{selected.description}</p>
          </div>
          <Badge tone={selected.enabled ? "good" : "warn"}>
            {selected.enabled ? "Available" : "Disabled"}
          </Badge>
        </header>
        {!selected.enabled && selected.policyReason ? (
          <div className="catalog-browser__callout" role="note">
            <strong>Profile policy</strong>
            <span>{selected.policyReason}</span>
          </div>
        ) : null}
        <dl className="catalog-browser__facts">
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
            className="catalog-browser__tokens"
          >
            <span className="eyebrow" id={`${panelId}-aliases`}>
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

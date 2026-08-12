import { type KeyboardEvent, useId, useRef, useState } from "react";
import { progressiveWindow } from "../components/progressive-window";
import { Badge, titleCase, type UnknownRecord } from "../lib";
import { buildToolCatalogItems } from "./tool-catalog-model";
import "./tool-catalog-workspace.css";

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
  const instanceId = useId().replaceAll(":", "");
  const listRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState({
    key: resetKey,
    id: items[0]?.id ?? "",
  });
  const [page, setPage] = useState({
    key: resetKey,
    limit: TOOL_CATALOG_PAGE_SIZE,
  });
  const selectedId =
    selection.key === resetKey && items.some((item) => item.id === selection.id)
      ? selection.id
      : (items[0]?.id ?? "");
  const selectedIndex = Math.max(
    0,
    items.findIndex((item) => item.id === selectedId),
  );
  const requested = page.key === resetKey ? page.limit : TOOL_CATALOG_PAGE_SIZE;
  const toolWindow = progressiveWindow(items, {
    pageSize: TOOL_CATALOG_PAGE_SIZE,
    requested,
    selectedIndex,
  });
  const selected = items[selectedIndex];
  const panelId = `${instanceId}-tool-detail`;

  const selectAt = (index: number, focus: boolean) => {
    const item = toolWindow.visible[index];
    if (!item) return;
    setSelection({ key: resetKey, id: item.id });
    if (focus) {
      requestAnimationFrame(() => {
        listRef.current
          ?.querySelector<HTMLButtonElement>(`[data-tool-index="${index}"]`)
          ?.focus();
      });
    }
  };

  const handleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex = index;
    if (event.key === "ArrowDown") {
      nextIndex = Math.min(toolWindow.visible.length - 1, index + 1);
    } else if (event.key === "ArrowUp") {
      nextIndex = Math.max(0, index - 1);
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = toolWindow.visible.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    selectAt(nextIndex, true);
  };

  if (!selected) return null;

  return (
    <section
      aria-label="Runtime tool catalog"
      className="tool-catalog-workspace"
    >
      <aside className="tool-catalog-index">
        <header className="tool-catalog-index__header">
          <div>
            <span className="eyebrow">Tool index</span>
            <strong>Browse capabilities</strong>
          </div>
          <small>{items.length} matches</small>
        </header>
        <div
          aria-label="Tools"
          aria-orientation="vertical"
          className="tool-catalog-index__list"
          ref={listRef}
          role="tablist"
        >
          {toolWindow.visible.map((item, index) => {
            const active = item.id === selected.id;
            const tabId = `${instanceId}-tool-${index}`;
            return (
              <button
                key={item.id}
                aria-controls={panelId}
                aria-selected={active}
                className={`tool-catalog-index__item${active ? " is-selected" : ""}`}
                data-tool-index={index}
                id={tabId}
                onClick={() => selectAt(index, false)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                role="tab"
                tabIndex={active ? 0 : -1}
                type="button"
              >
                <span className="tool-catalog-index__title">
                  <strong>{item.title}</strong>
                  {!item.enabled ? <Badge tone="warn">Disabled</Badge> : null}
                </span>
                <span className="tool-catalog-index__meta">
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
          <footer className="tool-catalog-index__footer">
            <span>
              {toolWindow.visible.length} of {items.length}
            </span>
            <button
              className="secondary-button"
              onClick={() =>
                setPage({
                  key: resetKey,
                  limit: toolWindow.limit + TOOL_CATALOG_PAGE_SIZE,
                })
              }
              type="button"
            >
              Show {Math.min(TOOL_CATALOG_PAGE_SIZE, toolWindow.remaining)} more
            </button>
          </footer>
        ) : null}
      </aside>
      <article
        aria-labelledby={`${instanceId}-tool-${selectedIndex}`}
        className="tool-catalog-detail"
        id={panelId}
        role="tabpanel"
      >
        <header className="tool-catalog-detail__header">
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
          <div className="tool-catalog-detail__policy" role="note">
            <strong>Profile policy</strong>
            <span>{selected.policyReason}</span>
          </div>
        ) : null}
        <dl className="tool-catalog-detail__facts">
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
            aria-labelledby={`${instanceId}-tool-aliases`}
            className="tool-catalog-detail__aliases"
          >
            <span className="eyebrow" id={`${instanceId}-tool-aliases`}>
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

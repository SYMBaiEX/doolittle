import "../components/catalog-browser.css";
import type { SkillCatalogItem } from "../catalog-entry-models";
import { useCatalogBrowser } from "../components/useCatalogBrowser";
import { Badge, titleCase } from "../lib";

export const SKILL_CATALOG_PAGE_SIZE = 12;

function invocationLabel(enabled: boolean): string {
  return enabled ? "Enabled" : "Not exposed";
}

export function SkillCatalogWorkspace({
  entries,
  resetKey,
}: {
  entries: readonly SkillCatalogItem[];
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
    idPrefix: "skill",
    items: entries,
    pageSize: SKILL_CATALOG_PAGE_SIZE,
    resetKey,
  });

  if (!selected) return null;
  const invocationRestricted =
    !selected.userInvocable || !selected.modelInvocable;

  return (
    <section
      aria-label="Skill catalog"
      className="catalog-browser skill-catalog-workspace"
    >
      <aside className="catalog-browser__index">
        <header className="catalog-browser__index-header">
          <div>
            <span className="eyebrow">Skill index</span>
            <strong>Browse workflows</strong>
          </div>
          <small>{entries.length} matches</small>
        </header>
        <div
          aria-label="Skills"
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
                  {!item.userInvocable && !item.modelInvocable ? (
                    <Badge tone="warn">Reference only</Badge>
                  ) : null}
                </span>
                <span className="catalog-browser__index-meta">
                  <code>/{item.commandName}</code>
                  <span>{titleCase(item.source)}</span>
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
              Show {Math.min(SKILL_CATALOG_PAGE_SIZE, window.remaining)} more
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
            <span className="eyebrow">Skill detail</span>
            <h2>{selected.title}</h2>
            <p>{selected.description}</p>
          </div>
          <Badge tone={invocationRestricted ? "warn" : "good"}>
            {invocationRestricted ? "Limited" : "Invocable"}
          </Badge>
        </header>
        {invocationRestricted ? (
          <div className="catalog-browser__callout" role="note">
            <strong>Invocation policy</strong>
            <span>
              This skill remains visible for reference, but one or more runtime
              invocation paths are disabled by its native policy.
            </span>
          </div>
        ) : null}
        <dl className="catalog-browser__facts">
          <div>
            <dt>Command</dt>
            <dd>
              <code>/{selected.commandName}</code>
            </dd>
          </div>
          <div>
            <dt>Skill ID</dt>
            <dd>
              <code>{selected.slug}</code>
            </dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>{titleCase(selected.source)}</dd>
          </div>
          <div>
            <dt>Family</dt>
            <dd>{titleCase(selected.family)}</dd>
          </div>
          <div>
            <dt>User command</dt>
            <dd>{invocationLabel(selected.userInvocable)}</dd>
          </div>
          <div>
            <dt>Model use</dt>
            <dd>{invocationLabel(selected.modelInvocable)}</dd>
          </div>
        </dl>
      </article>
    </section>
  );
}

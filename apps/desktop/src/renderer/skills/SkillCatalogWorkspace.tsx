import { Button } from "@elizaos/ui/components/ui/button";
import type { SkillCatalogItem } from "../catalog-entry-models";
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
    <section aria-label="Skill catalog" className={CATALOG_BROWSER_CLASS}>
      <aside className={CATALOG_INDEX_CLASS}>
        <header className={CATALOG_INDEX_HEADER_CLASS}>
          <div>
            <span className={CATALOG_EYEBROW_CLASS}>Skill index</span>
            <strong>Browse workflows</strong>
          </div>
          <small>{entries.length} matches</small>
        </header>
        <div
          aria-label="Skills"
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
                  {!item.userInvocable && !item.modelInvocable ? (
                    <Badge tone="warn">Reference only</Badge>
                  ) : null}
                </span>
                <span className={CATALOG_INDEX_META_CLASS}>
                  <code>/{item.commandName}</code>
                  <span>{titleCase(item.source)}</span>
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
              Show {Math.min(SKILL_CATALOG_PAGE_SIZE, window.remaining)} more
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
            <span className={CATALOG_EYEBROW_CLASS}>Skill detail</span>
            <h2>{selected.title}</h2>
            <p>{selected.description}</p>
          </div>
          <Badge tone={invocationRestricted ? "warn" : "good"}>
            {invocationRestricted ? "Limited" : "Invocable"}
          </Badge>
        </header>
        {invocationRestricted ? (
          <div className={CATALOG_CALLOUT_CLASS} role="note">
            <strong>Invocation policy</strong>
            <span>
              This skill remains visible for reference, but one or more runtime
              invocation paths are disabled by its native policy.
            </span>
          </div>
        ) : null}
        <dl className={CATALOG_FACTS_CLASS}>
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

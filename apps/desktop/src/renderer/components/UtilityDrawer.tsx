import { type ReactNode, useDeferredValue, useMemo, useState } from "react";
import "./utility-drawer.css";

export interface UtilityDrawerItem<TView extends string = string> {
  id: TView;
  label: string;
  description: string;
  /** A short, visual-only mark supplied by the shell (for example an icon). */
  icon?: ReactNode;
}

export interface UtilityDrawerSection<TView extends string = string> {
  id: string;
  label: string;
  items: readonly UtilityDrawerItem<TView>[];
}

export interface UtilityDrawerProps<TView extends string = string> {
  activeView: TView;
  activity: ReactNode;
  children?: ReactNode;
  onClose: () => void;
  onSelect: (view: TView) => void;
  /** The shell owns persistence; this component owns only its local filter. */
  openSections?: ReadonlySet<string>;
  onToggleSection?: (sectionId: string) => void;
  sections: readonly UtilityDrawerSection<TView>[];
}

export function filterUtilitySections<TView extends string>(
  sections: readonly UtilityDrawerSection<TView>[],
  query: string,
): UtilityDrawerSection<TView>[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return [...sections];

  return sections.flatMap((section) => {
    const matchesSection = section.label
      .toLocaleLowerCase()
      .includes(normalizedQuery);
    const items = matchesSection
      ? section.items
      : section.items.filter((item) =>
          `${item.label} ${item.description}`
            .toLocaleLowerCase()
            .includes(normalizedQuery),
        );
    return items.length > 0 ? [{ ...section, items }] : [];
  });
}

export function utilityResultCount<TView extends string>(
  sections: readonly UtilityDrawerSection<TView>[],
): number {
  return sections.reduce((count, section) => count + section.items.length, 0);
}

/**
 * The parent shell owns the modal, focus trap, Escape handling, and resizer.
 * Keeping those concerns outside makes the drawer reusable in a narrow pane too.
 */
export function UtilityDrawer<TView extends string>({
  activeView,
  activity,
  children,
  onClose,
  onSelect,
  onToggleSection,
  openSections,
  sections,
}: UtilityDrawerProps<TView>) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const filteredSections = useMemo(
    () => filterUtilitySections(sections, deferredQuery),
    [deferredQuery, sections],
  );
  const resultCount = utilityResultCount(filteredSections);
  const filtering = query.trim().length > 0;

  return (
    <>
      <header className="utility-drawer__header">
        <div>
          <span className="eyebrow">Doolittle workspace</span>
          <h2 id="utility-drawer-title">Tools & settings</h2>
        </div>
        <button
          aria-label="Close tools and settings"
          className="utility-drawer__close"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
      </header>

      <div className="utility-drawer__search">
        <label htmlFor="utility-drawer-search">Find a tool</label>
        <input
          autoComplete="off"
          id="utility-drawer-search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search tools, settings, or pages"
          type="search"
          value={query}
        />
        {filtering ? (
          <span aria-live="polite" className="utility-drawer__result-count">
            {resultCount} {resultCount === 1 ? "result" : "results"}
          </span>
        ) : null}
      </div>

      <div className="utility-drawer__activity">{activity}</div>

      <nav
        aria-label="All Doolittle tools and settings"
        className="utility-drawer__navigation"
      >
        {filteredSections.length > 0 ? (
          filteredSections.map((section) => {
            const expanded =
              filtering || openSections?.has(section.id) !== false;
            return (
              <section className="utility-drawer__group" key={section.id}>
                <button
                  aria-expanded={expanded}
                  className="utility-drawer__group-toggle"
                  onClick={() => onToggleSection?.(section.id)}
                  type="button"
                >
                  <span>{section.label}</span>
                  <span aria-hidden="true">{expanded ? "−" : "+"}</span>
                </button>
                {expanded ? (
                  <div className="utility-drawer__items">
                    {section.items.map((item) => {
                      const selected = item.id === activeView;
                      return (
                        <button
                          aria-current={selected ? "page" : undefined}
                          className={selected ? "is-selected" : undefined}
                          key={item.id}
                          onClick={() => onSelect(item.id)}
                          type="button"
                        >
                          {item.icon ? (
                            <span
                              aria-hidden="true"
                              className="utility-drawer__icon"
                            >
                              {item.icon}
                            </span>
                          ) : null}
                          <span className="utility-drawer__item-copy">
                            <strong>{item.label}</strong>
                            <small>{item.description}</small>
                          </span>
                          {selected ? (
                            <span
                              aria-hidden="true"
                              className="utility-drawer__current"
                            >
                              Current
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </section>
            );
          })
        ) : (
          <div className="utility-drawer__empty" role="status">
            <strong>No tools found</strong>
            <span>Try a page name, provider, runtime, or setting.</span>
          </div>
        )}
      </nav>

      {children ? <div className="utility-drawer__slot">{children}</div> : null}
    </>
  );
}

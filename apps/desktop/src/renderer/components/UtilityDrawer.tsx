import { type ReactNode, useDeferredValue, useMemo, useState } from "react";

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
  onPreload?: (view: TView) => void;
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
  onPreload,
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
  const totalTools = utilityResultCount(sections);

  return (
    <>
      <header className="flex min-h-19 items-center justify-between gap-3.5 border-[var(--line-subtle)] border-b bg-[var(--surface-soft)] p-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden="true"
            className="relative grid size-8.5 shrink-0 place-items-center rounded-[7px] border border-[color-mix(in_srgb,var(--accent)_27%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_9%,var(--surface))] font-bold font-mono text-[9px] text-[var(--accent)] tracking-[0.08em]"
          >
            <i className="absolute top-1.25 right-1.25 size-1 rounded-full bg-[var(--accent)] shadow-[0_0_8px_color-mix(in_srgb,var(--accent)_70%,transparent)]" />
            <span>OP</span>
          </span>
          <div className="grid min-w-0 gap-px">
            <span className="eyebrow">Operator console {"//"}</span>
            <h2
              className="m-0 font-semibold text-sm text-[var(--text)] tracking-[-0.015em] [font-family:var(--font-display)]"
              id="utility-drawer-title"
            >
              Tools & settings
            </h2>
            <p className="m-0 mt-px font-mono text-[8px] text-[var(--faint)] uppercase leading-tight tracking-[0.04em]">
              {totalTools} connected surfaces
            </p>
          </div>
        </div>
        <button
          aria-label="Close tools and settings"
          className="grid size-7 place-items-center rounded-[var(--radius-sm)] border border-transparent bg-transparent text-lg text-[var(--muted)] leading-none hover:border-[var(--border)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
      </header>

      <div className="relative grid gap-0 border-[var(--border)] border-b px-2.5 py-2">
        <label className="sr-only" htmlFor="utility-drawer-search">
          Find a tool or setting
        </label>
        <span
          aria-hidden="true"
          className="absolute top-3.75 left-4.75 z-1 font-bold font-mono text-[11px] text-[var(--accent)] leading-none"
        >
          /
        </span>
        <input
          autoComplete="off"
          className="h-8 w-full rounded-[5px] border border-[var(--border)] bg-[var(--surface-soft)] pr-12 pl-6.75 text-xs text-[var(--text)] outline-none placeholder:text-[var(--faint)] focus-visible:border-[var(--accent)]"
          id="utility-drawer-search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search tools, settings, or pages"
          type="search"
          value={query}
        />
        {filtering ? (
          <span
            aria-live="polite"
            className="absolute right-4.75 bottom-4.5 font-mono text-[9px] text-[var(--faint)]"
          >
            {resultCount} {resultCount === 1 ? "result" : "results"}
          </span>
        ) : null}
      </div>

      <div className="px-2.5 pt-2">{activity}</div>

      <nav
        aria-label="All Doolittle tools and settings"
        className="grid min-h-0 flex-1 content-start gap-1 overflow-y-auto overscroll-contain px-1.75 pt-2 pb-3.5 [scrollbar-gutter:stable]"
        data-utility-navigation=""
      >
        {filteredSections.length > 0 ? (
          filteredSections.map((section) => {
            const expanded =
              filtering || openSections?.has(section.id) !== false;
            return (
              <section
                className="grid gap-px rounded-md border border-[color-mix(in_srgb,var(--border)_72%,transparent)] bg-[color-mix(in_srgb,var(--surface-raised)_54%,transparent)] p-0.75"
                key={section.id}
              >
                <button
                  aria-expanded={expanded}
                  className="flex min-h-7 items-center justify-between rounded-[var(--radius-sm)] border-0 bg-transparent px-1.5 py-1.25 text-left font-mono text-[10px] text-[var(--muted)] uppercase tracking-[0.08em] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                  onClick={() => onToggleSection?.(section.id)}
                  type="button"
                >
                  <span className="inline-flex items-center gap-1.75">
                    <i
                      aria-hidden="true"
                      className="size-1 rounded-px bg-[var(--faint)]"
                    />
                    {section.label}
                  </span>
                  <span className="inline-flex items-center gap-2.25">
                    <b className="font-inherit text-[var(--faint)]">
                      {section.items.length}
                    </b>
                    <i
                      aria-hidden="true"
                      className="min-w-2.5 text-center text-xs text-[var(--faint)] not-italic"
                    >
                      {expanded ? "⌄" : "›"}
                    </i>
                  </span>
                </button>
                {expanded ? (
                  <div className="grid gap-0.5">
                    {section.items.map((item) => {
                      const selected = item.id === activeView;
                      return (
                        <button
                          aria-current={selected ? "page" : undefined}
                          className={`grid min-h-10 min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.25 rounded-[var(--radius-sm)] border px-1.75 py-1.5 text-left transition-colors motion-reduce:transition-none ${
                            selected
                              ? "border-[color-mix(in_srgb,var(--accent)_22%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_9%,var(--surface-soft))] text-[var(--text)] shadow-[inset_2px_0_var(--accent),0_5px_15px_rgb(0_0_0/8%)]"
                              : "border-transparent bg-transparent text-[var(--text-soft)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                          }`}
                          key={item.id}
                          onClick={() => onSelect(item.id)}
                          onFocus={() => onPreload?.(item.id)}
                          onPointerDown={() => onPreload?.(item.id)}
                          onPointerEnter={() => onPreload?.(item.id)}
                          type="button"
                        >
                          {item.icon ? (
                            <span
                              aria-hidden="true"
                              className={`grid size-6.5 place-items-center rounded-[5px] border ${
                                selected
                                  ? "border-[color-mix(in_srgb,var(--accent)_24%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_9%,var(--surface-soft))] text-[var(--accent)]"
                                  : "border-[color-mix(in_srgb,var(--border)_76%,transparent)] bg-[color-mix(in_srgb,var(--surface-soft)_80%,transparent)] text-[var(--faint)]"
                              }`}
                            >
                              {item.icon}
                            </span>
                          ) : null}
                          <span className="grid min-w-0 gap-0.5">
                            <strong className="truncate text-xs font-semibold">
                              {item.label}
                            </strong>
                            <small className="truncate text-[10px] text-[var(--muted)]">
                              {item.description}
                            </small>
                          </span>
                          {selected ? (
                            <span
                              aria-hidden="true"
                              className="inline-flex items-center gap-1.25 font-mono text-[9px] text-[var(--accent)] uppercase"
                            >
                              <i className="size-1.25 rounded-full bg-current shadow-[0_0_7px_color-mix(in_srgb,currentColor_70%,transparent)]" />
                              Live
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
          <div
            className="grid gap-1 px-2.5 py-5 text-center text-[var(--muted)]"
            role="status"
          >
            <strong className="text-xs text-[var(--text-soft)]">
              No tools found
            </strong>
            <span className="text-[11px]">
              Try a page name, provider, runtime, or setting.
            </span>
          </div>
        )}
      </nav>

      {children ? <div className="shrink-0">{children}</div> : null}
    </>
  );
}

import {
  type ComponentPropsWithRef,
  type ReactNode,
  useId,
  useRef,
} from "react";

export interface SettingsMenuItem {
  id: string;
  label: string;
  description: string;
  group?: string;
}

/** Controlled composition; the host owns routes, fetching and durable state. */
export function SettingsFrame({
  navigation,
  children,
  className,
  ...props
}: ComponentPropsWithRef<"div"> & { navigation: ReactNode }) {
  return (
    <div {...props} className={`dl-settings-frame ${className ?? ""}`}>
      <div className="settings-layout dl-settings-layout">
        {navigation}
        <section className="settings-content dl-settings-content">
          {children}
        </section>
      </div>
    </div>
  );
}

/** Selection never opens/collapses groups or changes the menu's geometry. */
export function SettingsMenu({
  items,
  value,
  onChange,
  query = "",
  onQueryChange,
}: {
  items: readonly SettingsMenuItem[];
  value: string;
  onChange: (id: string) => void;
  query?: string;
  onQueryChange?: (query: string) => void;
}) {
  const id = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const normalizedQuery = query.trim().toLowerCase();
  const matches = (item: SettingsMenuItem) =>
    !normalizedQuery ||
    `${item.label} ${item.description} ${item.group ?? ""}`
      .toLowerCase()
      .includes(normalizedQuery);
  const visible = items.filter((item) => item.id === value || matches(item));
  const groups = [...new Set(items.map((item) => item.group ?? "Settings"))];
  return (
    <aside
      className="settings-nav dl-settings-menu"
      aria-label="Settings categories"
    >
      <header className="dl-settings-menu-heading">
        <h2>Settings</h2>
        <p>Make Doolittle yours.</p>
      </header>
      <label className="dl-settings-mobile-select" htmlFor={`${id}-section`}>
        <span>Settings section</span>
        <select
          id={`${id}-section`}
          aria-label="Settings section"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {groups.map((group) => (
            <optgroup key={group} label={group}>
              {items
                .filter((item) => (item.group ?? "Settings") === group)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>
      {onQueryChange ? (
        <label className="settings-section-search dl-settings-menu-search">
          <span className="sr-only">Search settings sections</span>
          <input
            ref={searchRef}
            type="search"
            placeholder="Find a section…"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </label>
      ) : null}
      <nav
        className="dl-settings-menu-sections"
        aria-label="Settings sections"
        onKeyDown={(event) => {
          if (
            !(event.target instanceof HTMLButtonElement) ||
            !event.target.dataset.settingsSection
          )
            return;
          const buttons = [
            ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
              "button[data-settings-section]",
            ),
          ];
          const index = buttons.indexOf(event.target);
          const next =
            event.key === "ArrowDown"
              ? (index + 1) % buttons.length
              : event.key === "ArrowUp"
                ? (index + buttons.length - 1) % buttons.length
                : event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? buttons.length - 1
                    : undefined;
          if (next === undefined) return;
          event.preventDefault();
          buttons[next]?.focus();
        }}
      >
        {normalizedQuery && !items.some(matches) ? (
          <div role="status" className="dl-settings-search-empty">
            <p>No matching sections. Your current section stays available.</p>
            {onQueryChange ? (
              <button
                type="button"
                onClick={() => {
                  onQueryChange("");
                  searchRef.current?.focus();
                }}
              >
                Clear search
              </button>
            ) : null}
          </div>
        ) : null}
        {groups.map((group) => {
          const entries = visible.filter(
            (item) => (item.group ?? "Settings") === group,
          );
          if (!entries.length) return null;
          return (
            <section
              key={group}
              className="settings-nav-group dl-settings-menu-group"
              aria-label={group}
            >
              <h3>{group}</h3>
              {entries.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  data-settings-section={item.id}
                  aria-label={`${item.label}: ${item.description}`}
                  aria-current={value === item.id ? "page" : undefined}
                  title={item.description}
                  onClick={() => onChange(item.id)}
                >
                  <span>{item.label}</span>
                  <span className="dl-settings-current" aria-hidden="true">
                    ●
                  </span>
                </button>
              ))}
            </section>
          );
        })}
      </nav>
    </aside>
  );
}

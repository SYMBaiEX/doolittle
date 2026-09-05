export interface SettingsCategory {
  id: string;
  label: string;
  description: string;
  group?: string;
}

export function SettingsNavigation({
  categories,
  category,
  onSelect,
  query = "",
  onQueryChange,
}: {
  categories: SettingsCategory[];
  category: string;
  onSelect: (id: string) => void;
  query?: string;
  onQueryChange?: (query: string) => void;
}) {
  const normalizedQuery = query.trim().toLowerCase();
  const visibleCategories = categories.filter(
    (entry) =>
      entry.id === category ||
      !normalizedQuery ||
      `${entry.label} ${entry.description}`
        .toLowerCase()
        .includes(normalizedQuery),
  );
  const groups = [...new Set(visibleCategories.map((entry) => entry.group))];

  return (
    <aside className={SETTINGS_NAV_CLASS} aria-label="Settings categories">
      {onQueryChange ? (
        <label className={SETTINGS_NAV_SEARCH_CLASS}>
          <span className="sr-only">Search settings sections</span>
          <input
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search settings"
            type="search"
            value={query}
          />
        </label>
      ) : null}
      {groups.map((group) => {
        const entries = visibleCategories.filter(
          (entry) => entry.group === group,
        );
        const isOpen =
          Boolean(normalizedQuery) ||
          entries.some((entry) => entry.id === category);

        return (
          <details
            className={SETTINGS_NAV_GROUP_CLASS}
            key={group ?? "settings"}
            open={isOpen}
          >
            <summary>{group ?? "Settings"}</summary>
            <div>
              {entries.map((entry) => (
                <button
                  aria-label={`${entry.label}: ${entry.description}`}
                  className={`${SETTINGS_NAV_BUTTON_CLASS} ${
                    category === entry.id ? "selected" : ""
                  }`}
                  key={entry.id}
                  onClick={() => onSelect(entry.id)}
                  title={entry.description}
                  aria-current={category === entry.id ? "page" : undefined}
                  type="button"
                >
                  <strong>{entry.label}</strong>
                </button>
              ))}
            </div>
          </details>
        );
      })}
    </aside>
  );
}

import {
  SETTINGS_NAV_BUTTON_CLASS,
  SETTINGS_NAV_CLASS,
  SETTINGS_NAV_GROUP_CLASS,
  SETTINGS_NAV_SEARCH_CLASS,
} from "./settings-layout";

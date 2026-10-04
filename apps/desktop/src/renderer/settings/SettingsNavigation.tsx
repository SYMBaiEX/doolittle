import { useRef } from "react";

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
  const searchInputRef = useRef<HTMLInputElement>(null);
  const matchingCategories = categories.filter(
    (entry) =>
      !normalizedQuery ||
      `${entry.label} ${entry.description}`
        .toLowerCase()
        .includes(normalizedQuery),
  );
  const visibleCategories = categories.filter(
    (entry) => entry.id === category || matchingCategories.includes(entry),
  );
  const groups = [...new Set(visibleCategories.map((entry) => entry.group))];

  return (
    <aside className={SETTINGS_NAV_CLASS} aria-label="Settings categories">
      {onQueryChange ? (
        <label className={SETTINGS_NAV_SEARCH_CLASS}>
          <span className="sr-only">Search settings sections</span>
          <input
            ref={searchInputRef}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search settings"
            type="search"
            value={query}
          />
        </label>
      ) : null}
      {normalizedQuery && !matchingCategories.length ? (
        <div
          className="grid gap-2 py-2 text-[length:var(--text-control)] text-[var(--muted)]"
          role="status"
        >
          <p>No matching sections. Your current section stays available.</p>
          {onQueryChange ? (
            <Button
              onClick={() => {
                onQueryChange("");
                searchInputRef.current?.focus();
              }}
              type="button"
              variant="secondary"
            >
              Clear search
            </Button>
          ) : null}
        </div>
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

import { Button } from "../components/ElizaControls";
import {
  SETTINGS_NAV_BUTTON_CLASS,
  SETTINGS_NAV_CLASS,
  SETTINGS_NAV_GROUP_CLASS,
  SETTINGS_NAV_SEARCH_CLASS,
} from "./settings-layout";

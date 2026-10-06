import {
  type ComponentPropsWithRef,
  type ReactNode,
  useId,
  useRef,
} from "react";
import { type ContextAction, ContextActionMenu } from "./context-action-menu";

export interface SettingsMenuItem {
  id: string;
  label: string;
  description: string;
  group?: string;
  icon?: ReactNode;
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
  pickerItems = items,
  pickerValue = value,
  onPickerChange = onChange,
  contextActions,
}: {
  items: readonly SettingsMenuItem[];
  value: string;
  onChange: (id: string) => void;
  query?: string;
  onQueryChange?: (query: string) => void;
  pickerItems?: readonly SettingsMenuItem[];
  pickerValue?: string;
  onPickerChange?: (id: string) => void;
  contextActions?: (item: SettingsMenuItem) => readonly ContextAction[];
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
  const pickerGroups = [
    ...new Set(pickerItems.map((item) => item.group ?? "Settings")),
  ];
  return (
    <aside
      className="settings-nav dl-settings-menu"
      aria-label="Settings categories"
    >
      <header className="dl-settings-menu-heading">
        <h2>Settings</h2>
      </header>
      <label className="dl-settings-mobile-select" htmlFor={`${id}-section`}>
        <span>Settings section</span>
        <select
          id={`${id}-section`}
          aria-label="Settings section"
          value={pickerValue}
          onChange={(event) => onPickerChange(event.target.value)}
        >
          {pickerGroups.map((group) => (
            <optgroup key={group} label={group}>
              {pickerItems
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
              {groups.length > 1 || items.some((item) => item.group) ? (
                <h3>{group}</h3>
              ) : null}
              {entries.map((item) => (
                <ContextActionMenu
                  key={item.id}
                  label={`${item.label} settings actions`}
                  scopeKey={item.id}
                  items={
                    contextActions?.(item) ?? [
                      {
                        id: "open",
                        label: "Open section",
                        onSelect: () => onChange(item.id),
                      },
                    ]
                  }
                >
                  <button
                    type="button"
                    data-settings-section={item.id}
                    aria-label={`${item.label}: ${item.description}`}
                    aria-current={value === item.id ? "page" : undefined}
                    title={item.description}
                    onClick={() => onChange(item.id)}
                  >
                    {item.icon ? (
                      <span
                        className="dl-settings-menu-icon"
                        aria-hidden="true"
                      >
                        {item.icon}
                      </span>
                    ) : null}
                    <span className="dl-settings-menu-label">{item.label}</span>
                    <span className="dl-settings-current" aria-hidden="true">
                      ●
                    </span>
                  </button>
                </ContextActionMenu>
              ))}
            </section>
          );
        })}
      </nav>
    </aside>
  );
}

export interface SettingsTabItem {
  id: string;
  label: string;
}

/** Manual activation preserves form state while arrow keys explore sections. */
export function SettingsTabs({
  items,
  value,
  onChange,
  panelId,
  label = "Settings sections",
}: {
  items: readonly SettingsTabItem[];
  value: string;
  onChange: (id: string) => void;
  panelId: string;
  label?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="dl-settings-tabs"
      onKeyDown={(event) => {
        if (!(event.target instanceof HTMLButtonElement)) return;
        const tabs = [
          ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
            'button[role="tab"]',
          ),
        ];
        const index = tabs.indexOf(event.target);
        if (index < 0) return;
        const next =
          event.key === "ArrowRight"
            ? (index + 1) % tabs.length
            : event.key === "ArrowLeft"
              ? (index + tabs.length - 1) % tabs.length
              : event.key === "Home"
                ? 0
                : event.key === "End"
                  ? tabs.length - 1
                  : undefined;
        if (next === undefined) return;
        event.preventDefault();
        tabs[next]?.focus();
      }}
    >
      {items.map((item) => (
        <ContextActionMenu
          key={item.id}
          label={`${item.label} tab actions`}
          scopeKey={item.id}
          items={[
            {
              id: "open",
              label: "Open tab",
              onSelect: () => onChange(item.id),
            },
          ]}
        >
          <button
            id={`${panelId}-tab-${item.id}`}
            role="tab"
            type="button"
            aria-controls={panelId}
            aria-selected={value === item.id}
            tabIndex={value === item.id ? 0 : -1}
            onClick={() => onChange(item.id)}
          >
            {item.label}
          </button>
        </ContextActionMenu>
      ))}
    </div>
  );
}

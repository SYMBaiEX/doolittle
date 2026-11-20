import { type ReactNode, useState } from "react";

export function PanelTabs<T extends string>({
  id,
  label,
  items,
  selected,
  onSelect,
  variant = "section",
}: {
  id: string;
  label: string;
  items: readonly { id: T; label: ReactNode; panelId?: string }[];
  selected: T;
  onSelect: (id: T) => void;
  variant?: "section" | "pane";
}) {
  const [focused, setFocused] = useState<T | undefined>();
  // Capability refreshes can remove a tab before the owner updates selection.
  const focusableId =
    items.find((item) => item.id === focused)?.id ??
    items.find((item) => item.id === selected)?.id ??
    items[0]?.id;
  const pane = variant === "pane";
  return (
    <div
      aria-label={label}
      className={`flex min-w-0 shrink-0 items-center gap-1 overflow-x-auto overscroll-x-contain p-1 [scrollbar-width:thin] ${pane ? "coding-tabs border-[var(--border)] border-b" : ""}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(undefined);
      }}
      role="tablist"
      onKeyDown={(event) => {
        const tabs = Array.from(
          event.currentTarget.querySelectorAll<HTMLButtonElement>(
            'button[role="tab"]',
          ),
        );
        if (!(event.target instanceof HTMLButtonElement)) return;
        const index = tabs.indexOf(event.target);
        if (index < 0) return;
        const next =
          event.key === "ArrowRight"
            ? (index + 1) % tabs.length
            : event.key === "ArrowLeft"
              ? (index - 1 + tabs.length) % tabs.length
              : event.key === "Home"
                ? 0
                : event.key === "End"
                  ? tabs.length - 1
                  : undefined;
        if (next === undefined) return;
        event.preventDefault();
        // Move focus without loading another panel until Enter or Space.
        tabs[next]?.focus();
      }}
    >
      {items.map((item) => (
        <button
          aria-controls={item.panelId ?? `${id}-panel`}
          aria-selected={item.id === selected}
          className={`inline-flex shrink-0 items-center gap-1.75 whitespace-nowrap rounded-[var(--radius-sm)] border border-transparent px-2.5 font-medium text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] aria-selected:border-[var(--border)] aria-selected:bg-[var(--surface-raised)] aria-selected:font-semibold aria-selected:text-[var(--text)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--focus-ring)] forced-colors:aria-selected:border-[Highlight] ${pane ? "min-h-8 text-[length:var(--text-control)] max-[760px]:min-h-10" : "min-h-9 text-sm"}`}
          id={panelTabId(id, item.id)}
          key={item.id}
          onClick={() => onSelect(item.id)}
          onFocus={() => setFocused(item.id)}
          role="tab"
          tabIndex={item.id === focusableId ? 0 : -1}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function panelTabId(id: string, tabId: string): string {
  return `${id}-${tabId}-tab`;
}

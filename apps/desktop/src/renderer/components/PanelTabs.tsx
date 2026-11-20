import type { ReactNode } from "react";

export function PanelTabs<T extends string>({
  id,
  label,
  items,
  selected,
  onSelect,
  disabled,
}: {
  id: string;
  label: string;
  items: readonly { id: T; label: ReactNode; panelId?: string }[];
  selected: T;
  onSelect: (id: T) => void;
  disabled?: boolean;
}) {
  return (
    <div
      aria-label={label}
      className="flex min-w-0 items-center gap-1 overflow-x-auto overscroll-x-contain px-2 [scrollbar-width:thin]"
      role="tablist"
      onKeyDown={(event) => {
        const tabs = Array.from(
          event.currentTarget.querySelectorAll<HTMLButtonElement>(
            "button:not(:disabled)",
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
          className="min-h-10 shrink-0 whitespace-nowrap border-b-2 border-transparent px-2.5 text-sm text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] aria-selected:border-[var(--accent)] aria-selected:font-semibold aria-selected:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[var(--focus-ring)] disabled:opacity-50"
          disabled={disabled}
          id={`${id}-${item.id}-tab`}
          key={item.id}
          onClick={() => onSelect(item.id)}
          role="tab"
          tabIndex={item.id === selected ? 0 : -1}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

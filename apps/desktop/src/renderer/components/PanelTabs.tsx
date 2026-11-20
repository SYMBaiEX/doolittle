import { PanelTabList } from "@doolittle/ui";
import type { ReactNode } from "react";

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
  const pane = variant === "pane";
  return (
    <PanelTabList
      className={`flex min-w-0 shrink-0 items-center gap-1 overflow-x-auto overscroll-x-contain p-1 [scrollbar-width:thin] ${pane ? "coding-tabs border-[var(--border)] border-b" : ""}`}
      items={items.map((item) => ({
        ...item,
        buttonId: panelTabId(id, item.id),
        panelId: item.panelId ?? `${id}-panel`,
      }))}
      label={label}
      onSelect={onSelect}
      selected={selected}
      tabClassName={`shrink-0 gap-1.75 rounded-[var(--radius-sm)] border border-transparent px-2.5 text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] aria-selected:border-[var(--border)] aria-selected:font-semibold data-[state=active]:bg-[var(--surface-raised)] data-[state=active]:text-[var(--text)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--focus-ring)] forced-colors:aria-selected:border-[Highlight] ${pane ? "min-h-8 text-[length:var(--text-control)] max-[760px]:min-h-10" : "min-h-9 text-sm"}`}
    />
  );
}

export function panelTabId(id: string, tabId: string): string {
  return `${id}-${tabId}-tab`;
}

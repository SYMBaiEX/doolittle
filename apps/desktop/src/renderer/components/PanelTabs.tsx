import { PanelTabList } from "@doolittle/ui";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { UiIcon } from "./UiIcon";

export function PanelTabs<T extends string>({
  id,
  label,
  items,
  selected,
  onSelect,
  variant = "section",
  overflowControls = false,
}: {
  id: string;
  label: string;
  items: readonly {
    id: T;
    label: ReactNode;
    panelId?: string;
    title?: string;
  }[];
  selected: T;
  onSelect: (id: T) => void;
  variant?: "section" | "pane";
  overflowControls?: boolean;
}) {
  const pane = variant === "pane";
  const hostRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  const [edges, setEdges] = useState({ start: true, end: false });

  useLayoutEffect(() => {
    if (!overflowControls) return;
    const host = hostRef.current;
    const list = host?.querySelector<HTMLElement>('[role="tablist"]');
    if (!host || !list) return;

    const update = () => {
      // Compare against the whole rail, not the space reserved by its arrows.
      setOverflow(list.scrollWidth > host.clientWidth + 1);
      const start = list.scrollLeft <= 1;
      const end = list.scrollWidth - list.clientWidth - list.scrollLeft <= 1;
      setEdges((current) =>
        current.start === start && current.end === end
          ? current
          : { start, end },
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    observer.observe(list);
    for (const tab of list.children) observer.observe(tab);
    list.addEventListener("scroll", update);
    return () => {
      observer.disconnect();
      list.removeEventListener("scroll", update);
    };
  }, [overflowControls]);

  useLayoutEffect(() => {
    if (!overflowControls || !overflow) return;
    const tab = document.getElementById(panelTabId(id, selected));
    if (hostRef.current?.contains(tab)) {
      tab?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [id, overflowControls, selected, overflow]);

  const scroll = (direction: number) => {
    const list =
      hostRef.current?.querySelector<HTMLElement>('[role="tablist"]');
    list?.scrollBy({ left: direction * list.clientWidth * 0.75 });
  };
  const tabs = (
    <PanelTabList
      className={`flex min-w-0 shrink-0 items-center gap-1 overflow-x-auto overscroll-x-contain p-1 ${overflowControls ? "flex-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" : "[scrollbar-width:thin]"} ${pane ? "coding-tabs border-[var(--border)] border-b" : ""}`}
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
  if (!overflowControls) return tabs;

  const arrowClass =
    "grid min-h-9 w-8 shrink-0 place-items-center rounded-[var(--radius-sm)] text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] disabled:opacity-30 disabled:hover:bg-transparent focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--focus-ring)]";
  return (
    <div
      className="flex min-w-0 max-w-full items-center self-stretch overflow-hidden [&_[role=tab]:focus-visible]:[outline-style:solid] [&_[role=tab]:focus-visible]:outline-1 [&_[role=tab]:focus-visible]:outline-offset-[-2px] [&_[role=tab]:focus-visible]:outline-[var(--focus-ring)] forced-colors:[&_[role=tab]:focus-visible]:outline-[Highlight]"
      onFocusCapture={(event) => {
        const target = event.target;
        // Pointer re-entry can leave the SDK's scrollport itself focused.
        // Always enter on a tab so arrow keys navigate rather than scroll.
        if (target.getAttribute("role") === "tablist") {
          target
            .querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
            ?.focus();
        } else if (target.getAttribute("role") === "tab") {
          target.scrollIntoView({ block: "nearest", inline: "nearest" });
        }
      }}
      ref={hostRef}
    >
      {overflow ? (
        <button
          aria-label={`Scroll ${label.toLowerCase()} left`}
          className={arrowClass}
          disabled={edges.start}
          onClick={() => scroll(-1)}
          title="Show earlier tabs"
          type="button"
        >
          <UiIcon icon={ChevronLeft} />
        </button>
      ) : null}
      {tabs}
      {overflow ? (
        <button
          aria-label={`Scroll ${label.toLowerCase()} right`}
          className={arrowClass}
          disabled={edges.end}
          onClick={() => scroll(1)}
          title="Show more tabs"
          type="button"
        >
          <UiIcon icon={ChevronRight} />
        </button>
      ) : null}
    </div>
  );
}

export function panelTabId(id: string, tabId: string): string {
  return `${id}-${tabId}-tab`;
}

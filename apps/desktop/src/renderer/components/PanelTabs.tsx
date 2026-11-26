import { PanelTabList } from "@doolittle/ui";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { UiIcon } from "./UiIcon";

const SCROLL_EDGE_TOLERANCE = 1;

function tabStart(list: HTMLElement, tab: Element): number {
  if (!(tab instanceof HTMLElement)) return 0;
  return Math.max(0, tab.offsetLeft - list.offsetLeft);
}

function scrollPositions(list: HTMLElement): number[] {
  const max = Math.max(0, list.scrollWidth - list.clientWidth);
  const positions = new Set<number>([0, max]);
  for (const tab of list.children) {
    positions.add(Math.min(max, tabStart(list, tab)));
  }
  return [...positions].sort((left, right) => left - right);
}

function snappedScrollLeft(list: HTMLElement, direction: number): number {
  const current = list.scrollLeft;
  const positions = scrollPositions(list);
  const desired = current + direction * list.clientWidth * 0.75;
  if (direction > 0) {
    const forward = positions.filter(
      (position) => position > current + SCROLL_EDGE_TOLERANCE,
    );
    const withinPage = forward.filter(
      (position) => position <= desired + SCROLL_EDGE_TOLERANCE,
    );
    return withinPage.at(-1) ?? forward[0] ?? current;
  }
  const backward = positions.filter(
    (position) => position < current - SCROLL_EDGE_TOLERANCE,
  );
  const withinPage = backward.filter(
    (position) => position >= desired - SCROLL_EDGE_TOLERANCE,
  );
  return withinPage[0] ?? backward.at(-1) ?? current;
}

function tabIsVisible(list: HTMLElement, tab: HTMLElement): boolean {
  const start = tabStart(list, tab);
  const end = start + tab.offsetWidth;
  const visibleStart = list.scrollLeft;
  const visibleEnd = visibleStart + list.clientWidth;
  return (
    start >= visibleStart - SCROLL_EDGE_TOLERANCE &&
    end <= visibleEnd + SCROLL_EDGE_TOLERANCE
  );
}

function revealTab(list: HTMLElement, tab: HTMLElement) {
  if (tabIsVisible(list, tab)) return;
  const max = Math.max(0, list.scrollWidth - list.clientWidth);
  const left = Math.min(max, tabStart(list, tab));
  if (Math.abs(left - list.scrollLeft) <= SCROLL_EDGE_TOLERANCE) return;
  list.scrollTo({ left });
}

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
      const overflowing = list.scrollWidth > host.clientWidth + 1;
      // Hand focus back to the selected tab before removing a focused arrow.
      if (!overflowing && document.activeElement?.parentElement === host) {
        list
          .querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
          ?.focus();
      }
      setOverflow(overflowing);
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
    const list =
      hostRef.current?.querySelector<HTMLElement>('[role="tablist"]');
    if (list && tab instanceof HTMLElement && list.contains(tab)) {
      revealTab(list, tab);
    }
  }, [id, overflowControls, selected, overflow]);

  const scroll = (direction: number) => {
    if ((direction < 0 && edges.start) || (direction > 0 && edges.end)) return;
    const list =
      hostRef.current?.querySelector<HTMLElement>('[role="tablist"]');
    if (!list) return;
    list.scrollTo({ left: snappedScrollLeft(list, direction) });
  };
  const tabs = (
    <PanelTabList
      className={`flex min-w-0 shrink-0 snap-x snap-proximity items-center gap-1 overflow-x-auto overscroll-x-contain p-1 ${overflowControls ? "flex-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" : "[scrollbar-width:thin]"} ${pane ? "coding-tabs border-[var(--border)] border-b" : ""}`}
      items={items.map((item) => ({
        ...item,
        buttonId: panelTabId(id, item.id),
        panelId: item.panelId ?? `${id}-panel`,
      }))}
      label={label}
      onSelect={onSelect}
      selected={selected}
      tabClassName={`shrink-0 snap-start gap-1.75 rounded-[var(--radius-sm)] border border-transparent px-2.5 text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] aria-selected:border-[var(--border)] aria-selected:font-semibold data-[state=active]:bg-[var(--surface-raised)] data-[state=active]:text-[var(--text)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--focus-ring)] forced-colors:aria-selected:border-[Highlight] ${pane ? "min-h-8 text-[length:var(--text-control)] max-[760px]:min-h-10" : "min-h-9 text-sm"}`}
    />
  );
  if (!overflowControls) return tabs;

  const arrowClass =
    "grid min-h-9 w-8 shrink-0 place-items-center rounded-[var(--radius-sm)] text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] aria-disabled:opacity-30 aria-disabled:hover:bg-transparent focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--focus-ring)]";
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
        } else if (
          target.getAttribute("role") === "tab" &&
          target instanceof HTMLElement
        ) {
          const list =
            hostRef.current?.querySelector<HTMLElement>('[role="tablist"]');
          if (list?.contains(target)) revealTab(list, target);
        }
      }}
      ref={hostRef}
    >
      {overflow ? (
        <button
          aria-disabled={edges.start}
          aria-label={`Scroll ${label.toLowerCase()} left`}
          className={arrowClass}
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
          aria-disabled={edges.end}
          aria-label={`Scroll ${label.toLowerCase()} right`}
          className={arrowClass}
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

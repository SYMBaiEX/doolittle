import { type KeyboardEvent, useId, useRef, useState } from "react";
import { progressiveWindow } from "./progressive-window";

export interface CatalogBrowserItem {
  id: string;
}

export function useCatalogBrowser<T extends CatalogBrowserItem>({
  idPrefix,
  items,
  pageSize,
  resetKey,
}: {
  idPrefix: string;
  items: readonly T[];
  pageSize: number;
  resetKey: string;
}) {
  const instanceId = useId().replaceAll(":", "");
  const listRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState({
    key: resetKey,
    id: items[0]?.id ?? "",
  });
  const [page, setPage] = useState({ key: resetKey, limit: pageSize });
  const selectedId =
    selection.key === resetKey && items.some((item) => item.id === selection.id)
      ? selection.id
      : (items[0]?.id ?? "");
  const selectedIndex = Math.max(
    0,
    items.findIndex((item) => item.id === selectedId),
  );
  const requested = page.key === resetKey ? page.limit : pageSize;
  const window = progressiveWindow([...items], {
    pageSize,
    requested,
    selectedIndex,
  });
  const selected = items[selectedIndex];
  const panelId = `${instanceId}-${idPrefix}-detail`;
  const itemId = (index: number) => `${instanceId}-${idPrefix}-${index}`;

  const selectAt = (index: number, focus: boolean) => {
    const item = window.visible[index];
    if (!item) return;
    setSelection({ key: resetKey, id: item.id });
    if (focus) {
      requestAnimationFrame(() => {
        listRef.current
          ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
          .item(index)
          .focus();
      });
    }
  };

  const handleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex = index;
    if (event.key === "ArrowDown") {
      nextIndex = Math.min(window.visible.length - 1, index + 1);
    } else if (event.key === "ArrowUp") {
      nextIndex = Math.max(0, index - 1);
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = window.visible.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    selectAt(nextIndex, true);
  };

  const showMore = () => {
    setPage({ key: resetKey, limit: window.limit + pageSize });
  };

  return {
    handleKeyDown,
    itemId,
    listRef,
    panelId,
    selected,
    selectedIndex,
    selectAt,
    showMore,
    window,
  };
}

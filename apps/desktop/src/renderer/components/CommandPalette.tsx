import { Button } from "@elizaos/ui/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@elizaos/ui/components/ui/dialog";
import { Input } from "@elizaos/ui/components/ui/input";
import { ScrollArea } from "@elizaos/ui/components/ui/scroll-area";
import {
  type ChangeEvent,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  buildCommandPaletteMatches,
  type CommandGroup,
  type CommandItem,
  type CommandMatch,
  getFocusableCommandIndexes,
  nextFocusableCommandIndex,
} from "./command-palette-model";
import { ShortcutHint } from "./ShortcutHint";

export type {
  CommandGroup,
  CommandItem,
  CommandMatch,
  CommandPaletteGroupMatch,
  CommandShortcut,
} from "./command-palette-model";

interface CommandPaletteProps<TData = unknown> {
  isOpen: boolean;
  onClose: () => void;
  groups: readonly CommandGroup<TData>[];
  title?: string;
  searchPlaceholder?: string;
  initialQuery?: string;
  resetOnOpen?: boolean;
  closeOnSelect?: boolean;
  onCommandActivate?: (command: CommandItem<TData>) => void;
  onQueryChange?: (query: string) => void;
  returnFocusTarget?: HTMLElement | null;
  noResultsText?: string;
}

const BASE_TITLE = "Command Palette";
const BASE_PLACEHOLDER = "Search commands";
const BASE_NO_RESULTS_TEXT = "No matching commands";

export function CommandPalette<TData = unknown>({
  isOpen,
  onClose,
  groups,
  title = BASE_TITLE,
  searchPlaceholder = BASE_PLACEHOLDER,
  initialQuery = "",
  resetOnOpen = false,
  closeOnSelect = true,
  onCommandActivate,
  onQueryChange,
  returnFocusTarget,
  noResultsText = BASE_NO_RESULTS_TEXT,
}: CommandPaletteProps<TData>): ReactNode {
  const titleId = useId();
  const inputId = useId();
  const listId = useId();

  const [query, setQuery] = useState(initialQuery);
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  const listboxRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const matches = useMemo(
    () => buildCommandPaletteMatches(groups, query),
    [groups, query],
  );
  const groupedMatches = matches.grouped;
  const flattenedMatches = matches.flattened;

  const focusableIndexes = useMemo(
    () => getFocusableCommandIndexes(flattenedMatches),
    [flattenedMatches],
  );

  const selectCommand = useCallback(
    (match: CommandMatch<TData>) => {
      if (match.disabled) {
        return;
      }

      match.onSelect?.(match);
      onCommandActivate?.(match);

      if (closeOnSelect) {
        onClose();
      }
    },
    [closeOnSelect, onClose, onCommandActivate],
  );

  const handleKeyDown = useCallback(
    (
      event: React.KeyboardEvent<
        HTMLButtonElement | HTMLInputElement | HTMLDivElement
      >,
    ) => {
      if (!isOpen) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (flattenedMatches.length === 0) {
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((current) =>
          nextFocusableCommandIndex(focusableIndexes, current, 1),
        );
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((current) =>
          nextFocusableCommandIndex(focusableIndexes, current, -1),
        );
        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        setActiveIndex(focusableIndexes[0] ?? -1);
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        setActiveIndex(focusableIndexes[focusableIndexes.length - 1] ?? -1);
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        const active = flattenedMatches[activeIndex];
        if (active) {
          selectCommand(active);
        }
      }
    },
    [
      focusableIndexes,
      flattenedMatches,
      isOpen,
      onClose,
      selectCommand,
      activeIndex,
    ],
  );

  useEffect(() => {
    if (isOpen && resetOnOpen) {
      setQuery(initialQuery);
    }
  }, [isOpen, initialQuery, resetOnOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const firstFocus = focusableIndexes[0];
    setActiveIndex(firstFocus ?? -1);
  }, [focusableIndexes, isOpen]);

  const onSearchChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const next = event.target.value;
      setQuery(next);
      onQueryChange?.(next);
      setActiveIndex(focusableIndexes[0] ?? -1);
    },
    [onQueryChange, focusableIndexes],
  );

  const onItemClick = useCallback(
    (match: CommandMatch<TData>) => {
      selectCommand(match);
    },
    [selectCommand],
  );

  const onMouseMove = useCallback(
    (index: number) => {
      const target = flattenedMatches[index];
      if (!target || target.disabled) {
        return;
      }
      setActiveIndex(index);
    },
    [flattenedMatches],
  );

  const onOptionMouseDown = useCallback((event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
  }, []);

  const activeOptionId =
    activeIndex >= 0 ? flattenedMatches[activeIndex]?.optionId : undefined;

  useEffect(() => {
    if (!activeOptionId) return;
    listboxRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [activeOptionId]);

  const resultCount = flattenedMatches.length;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="command-palette"
        aria-labelledby={titleId}
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          searchRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          if (!returnFocusTarget?.isConnected) return;
          event.preventDefault();
          returnFocusTarget.focus();
        }}
      >
        <header className="command-palette__header">
          <div className="command-palette__heading">
            <span aria-hidden="true" className="command-palette__mark">
              &gt;
            </span>
            <DialogTitle id={titleId} className="command-palette__title">
              {title}
            </DialogTitle>
          </div>
          <DialogClose asChild>
            <Button
              type="button"
              className="command-palette__close"
              variant="ghost"
              size="sm"
              aria-label="Close command palette"
            >
              Esc
            </Button>
          </DialogClose>
        </header>

        <label htmlFor={inputId} className="command-palette__label">
          <span className="command-palette__sr-only">Search</span>
          <span className="command-palette__search-shell">
            <span aria-hidden="true" className="command-palette__search-icon" />
            <Input
              ref={searchRef}
              id={inputId}
              className="command-palette__search"
              type="search"
              value={query}
              onChange={onSearchChange}
              onKeyDown={handleKeyDown}
              placeholder={searchPlaceholder}
              role="combobox"
              aria-autocomplete="list"
              aria-controls={listId}
              aria-activedescendant={activeOptionId}
              aria-expanded="true"
            />
          </span>
        </label>

        <ScrollArea className="command-palette__scroll">
          <div
            ref={listboxRef}
            id={listId}
            className="command-palette__list"
            role="listbox"
            aria-label="Command list"
            aria-activedescendant={activeOptionId}
            onKeyDown={handleKeyDown}
            tabIndex={-1}
          >
            {groupedMatches.length === 0 ? (
              <p className="command-palette__empty" role="status">
                {noResultsText}
              </p>
            ) : (
              groupedMatches.map((group) => (
                <fieldset
                  aria-labelledby={`${listId}-${group.groupId}-label`}
                  className="command-palette__group"
                  key={group.groupId}
                >
                  <legend
                    className="command-palette__group-label"
                    id={`${listId}-${group.groupId}-label`}
                  >
                    {group.groupLabel}
                  </legend>
                  {group.items.map((item) => {
                    const optionId = `${group.groupId}:${item.id}`;
                    const isActive =
                      flattenedMatches[activeIndex]?.optionId === optionId;
                    return (
                      <div
                        aria-disabled={item.disabled}
                        aria-selected={isActive}
                        className="command-palette__item"
                        id={optionId}
                        key={optionId}
                        onClick={() => onItemClick(item)}
                        onKeyDown={handleKeyDown}
                        onMouseDown={onOptionMouseDown}
                        onMouseMove={() =>
                          onMouseMove(
                            flattenedMatches.findIndex(
                              (match) => match.optionId === optionId,
                            ),
                          )
                        }
                        role="option"
                        tabIndex={-1}
                      >
                        <span className="command-palette__item-label">
                          {item.label}
                        </span>
                        {item.description ? (
                          <span className="command-palette__item-description">
                            {item.description}
                          </span>
                        ) : null}
                        {item.shortcuts ? (
                          <ShortcutHint
                            keys={item.shortcuts}
                            className="command-palette__item-shortcut"
                          />
                        ) : null}
                      </div>
                    );
                  })}
                </fieldset>
              ))
            )}
          </div>
        </ScrollArea>
        <footer className="command-palette__footer">
          <span aria-live="polite">
            {resultCount} {resultCount === 1 ? "result" : "results"}
          </span>
          <span aria-hidden="true" className="command-palette__key-guide">
            <kbd>↑↓</kbd> move <kbd>↵</kbd> open
          </span>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

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
  COMMAND_PALETTE_CLASS,
  COMMAND_PALETTE_CLOSE_CLASS,
  COMMAND_PALETTE_EMPTY_CLASS,
  COMMAND_PALETTE_FOOTER_CLASS,
  COMMAND_PALETTE_GROUP_CLASS,
  COMMAND_PALETTE_GROUP_LABEL_CLASS,
  COMMAND_PALETTE_HEADER_CLASS,
  COMMAND_PALETTE_HEADING_CLASS,
  COMMAND_PALETTE_ITEM_CLASS,
  COMMAND_PALETTE_ITEM_DESCRIPTION_CLASS,
  COMMAND_PALETTE_ITEM_LABEL_CLASS,
  COMMAND_PALETTE_ITEM_SHORTCUT_CLASS,
  COMMAND_PALETTE_KEY_GUIDE_CLASS,
  COMMAND_PALETTE_LABEL_CLASS,
  COMMAND_PALETTE_LIST_CLASS,
  COMMAND_PALETTE_MARK_CLASS,
  COMMAND_PALETTE_SCROLL_CLASS,
  COMMAND_PALETTE_SEARCH_CLASS,
  COMMAND_PALETTE_SEARCH_ICON_CLASS,
  COMMAND_PALETTE_SEARCH_SHELL_CLASS,
  COMMAND_PALETTE_TITLE_CLASS,
} from "../app-shell/overlay-layout";
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
        className={COMMAND_PALETTE_CLASS}
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
        <header className={COMMAND_PALETTE_HEADER_CLASS}>
          <div className={COMMAND_PALETTE_HEADING_CLASS}>
            <span aria-hidden="true" className={COMMAND_PALETTE_MARK_CLASS}>
              &gt;
            </span>
            <DialogTitle id={titleId} className={COMMAND_PALETTE_TITLE_CLASS}>
              {title}
            </DialogTitle>
          </div>
          <DialogClose asChild>
            <Button
              type="button"
              className={COMMAND_PALETTE_CLOSE_CLASS}
              variant="ghost"
              size="sm"
              aria-label="Close command palette"
            >
              Esc
            </Button>
          </DialogClose>
        </header>

        <label htmlFor={inputId} className={COMMAND_PALETTE_LABEL_CLASS}>
          <span className="sr-only">Search</span>
          <span className={COMMAND_PALETTE_SEARCH_SHELL_CLASS}>
            <span
              aria-hidden="true"
              className={COMMAND_PALETTE_SEARCH_ICON_CLASS}
            >
              ⌕
            </span>
            <Input
              ref={searchRef}
              id={inputId}
              className={COMMAND_PALETTE_SEARCH_CLASS}
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

        <ScrollArea className={COMMAND_PALETTE_SCROLL_CLASS}>
          <div
            ref={listboxRef}
            id={listId}
            className={COMMAND_PALETTE_LIST_CLASS}
            role="listbox"
            aria-label="Command list"
            aria-activedescendant={activeOptionId}
            onKeyDown={handleKeyDown}
            tabIndex={-1}
          >
            {groupedMatches.length === 0 ? (
              <p className={COMMAND_PALETTE_EMPTY_CLASS} role="status">
                {noResultsText}
              </p>
            ) : (
              groupedMatches.map((group) => (
                <fieldset
                  aria-labelledby={`${listId}-${group.groupId}-label`}
                  className={COMMAND_PALETTE_GROUP_CLASS}
                  key={group.groupId}
                >
                  <legend
                    className={COMMAND_PALETTE_GROUP_LABEL_CLASS}
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
                        className={COMMAND_PALETTE_ITEM_CLASS}
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
                        <span className={COMMAND_PALETTE_ITEM_LABEL_CLASS}>
                          {item.label}
                        </span>
                        {item.description ? (
                          <span
                            className={COMMAND_PALETTE_ITEM_DESCRIPTION_CLASS}
                          >
                            {item.description}
                          </span>
                        ) : null}
                        {item.shortcuts ? (
                          <ShortcutHint
                            keys={item.shortcuts}
                            className={COMMAND_PALETTE_ITEM_SHORTCUT_CLASS}
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
        <footer className={COMMAND_PALETTE_FOOTER_CLASS}>
          <span aria-live="polite">
            {resultCount} {resultCount === 1 ? "result" : "results"}
          </span>
          <span aria-hidden="true" className={COMMAND_PALETTE_KEY_GUIDE_CLASS}>
            <kbd>↑↓</kbd> move <kbd>↵</kbd> open
          </span>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

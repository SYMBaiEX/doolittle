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
import { ShortcutHint } from "./ShortcutHint";

export interface CommandShortcut {
  label: string;
}

export interface CommandItem<TData = unknown> {
  id: string;
  label: string;
  description?: string;
  keywords?: readonly string[];
  shortcuts?: readonly string[];
  data?: TData;
  disabled?: boolean;
  onSelect?: (item: CommandItem<TData>) => void;
}

export interface CommandGroup<TData = unknown> {
  id: string;
  label: string;
  items: readonly CommandItem<TData>[];
}

export interface CommandMatch<TData = unknown> extends CommandItem<TData> {
  score: number;
}

export interface CommandPaletteGroupMatch<TData = unknown> {
  groupId: string;
  groupLabel: string;
  items: readonly CommandMatch<TData>[];
}

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

function normalizeValue(value: string) {
  return value.toLowerCase().trim();
}

function tokenize(query: string): readonly string[] {
  return query
    .toLowerCase()
    .trim()
    .split(/\s+/u)
    .filter((segment) => segment.length > 0);
}

function scoreMatch(target: string, token: string): number {
  const normalized = normalizeValue(target);
  if (!normalized.includes(token)) return -1;
  if (normalized.startsWith(token))
    return token.length === normalized.length ? 100 : 80;
  if (normalized.includes(` ${token}`)) return 60;
  return 30;
}

function matchCommand<TData>(
  command: CommandItem<TData>,
  tokens: readonly string[],
): CommandMatch<TData> | null {
  if (tokens.length === 0) {
    return { ...command, score: 0 };
  }

  const label = normalizeValue(command.label);
  const description = normalizeValue(command.description ?? "");
  const keywords = (command.keywords ?? []).map(normalizeValue);

  let score = 0;

  for (const token of tokens) {
    const labelScore = scoreMatch(label, token);
    if (labelScore >= 0) {
      score += labelScore;
      continue;
    }

    const descriptionScore = scoreMatch(description, token);
    if (descriptionScore >= 0) {
      score += descriptionScore - 10;
      continue;
    }

    const keywordScore = Math.max(
      ...keywords.map((entry) => scoreMatch(entry, token)),
      -1,
    );
    if (keywordScore >= 0) {
      score += keywordScore - 15;
      continue;
    }

    return null;
  }

  return { ...command, score };
}

function getFocusableIndexes<TData>(
  flattened: readonly (CommandMatch<TData> & {
    groupId: string;
    globalIndex: number;
    optionId: string;
  })[],
): number[] {
  return flattened
    .map((entry, index) => (entry.disabled ? -1 : index))
    .filter((index) => index >= 0);
}

function nextFocusableIndex(
  candidates: number[],
  current: number,
  direction: 1 | -1,
): number {
  if (candidates.length === 0) return -1;

  if (current === -1) {
    return direction === 1 ? candidates[0] : candidates[candidates.length - 1];
  }

  const currentPosition = candidates.indexOf(current);

  if (currentPosition === -1) {
    return direction === 1 ? candidates[0] : candidates[candidates.length - 1];
  }

  const nextPosition =
    (currentPosition + direction + candidates.length) % candidates.length;

  return candidates[nextPosition] ?? candidates[0] ?? -1;
}

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

  const tokens = useMemo(() => tokenize(query), [query]);

  const groupedMatches = useMemo(() => {
    const built = groups
      .map((group) => {
        const items = group.items
          .map((item) => matchCommand(item, tokens))
          .filter((match): match is CommandMatch<TData> => match !== null)
          .sort(
            (left, right) =>
              right.score - left.score || left.label.localeCompare(right.label),
          );

        return {
          groupId: group.id,
          groupLabel: group.label,
          items,
        };
      })
      .filter((group) => group.items.length > 0);

    return built;
  }, [groups, tokens]);

  const flattenedMatches = useMemo(
    () =>
      groupedMatches.flatMap((group) =>
        group.items.map((match, index) => ({
          ...match,
          groupId: group.groupId,
          globalIndex: index,
          optionId: `${group.groupId}:${match.id}`,
          groupLabel: group.groupLabel,
        })),
      ),
    [groupedMatches],
  );

  const focusableIndexes = useMemo(
    () => getFocusableIndexes(flattenedMatches),
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
          nextFocusableIndex(focusableIndexes, current, 1),
        );
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((current) =>
          nextFocusableIndex(focusableIndexes, current, -1),
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
          <DialogTitle id={titleId} className="command-palette__title">
            {title}
          </DialogTitle>
          <DialogClose asChild>
            <Button
              type="button"
              className="command-palette__close"
              variant="ghost"
              size="sm"
              aria-label="Close command palette"
            >
              Close
            </Button>
          </DialogClose>
        </header>

        <label htmlFor={inputId} className="command-palette__label">
          <span className="command-palette__sr-only">Search</span>
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
      </DialogContent>
    </Dialog>
  );
}

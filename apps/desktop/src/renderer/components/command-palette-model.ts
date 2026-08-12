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

export interface FlattenedCommandMatch<TData = unknown>
  extends CommandMatch<TData> {
  groupId: string;
  groupLabel: string;
  optionId: string;
}

function normalizeValue(value: string): string {
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
  if (normalized.startsWith(token)) {
    return token.length === normalized.length ? 100 : 80;
  }
  if (normalized.includes(` ${token}`)) return 60;
  return 30;
}

function matchCommand<TData>(
  command: CommandItem<TData>,
  tokens: readonly string[],
): CommandMatch<TData> | null {
  if (tokens.length === 0) return { ...command, score: 0 };

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

export function buildCommandPaletteMatches<TData>(
  groups: readonly CommandGroup<TData>[],
  query: string,
): {
  flattened: FlattenedCommandMatch<TData>[];
  grouped: CommandPaletteGroupMatch<TData>[];
} {
  const tokens = tokenize(query);
  const grouped = groups
    .map((group) => {
      const items = group.items
        .map((item) => matchCommand(item, tokens))
        .filter((match): match is CommandMatch<TData> => match !== null);

      if (tokens.length > 0) {
        items.sort(
          (left, right) =>
            right.score - left.score || left.label.localeCompare(right.label),
        );
      }

      return { groupId: group.id, groupLabel: group.label, items };
    })
    .filter((group) => group.items.length > 0);
  const flattened = grouped.flatMap((group) =>
    group.items.map((match) => ({
      ...match,
      groupId: group.groupId,
      groupLabel: group.groupLabel,
      optionId: `${group.groupId}:${match.id}`,
    })),
  );
  return { flattened, grouped };
}

export function getFocusableCommandIndexes<TData>(
  flattened: readonly FlattenedCommandMatch<TData>[],
): number[] {
  return flattened
    .map((entry, index) => (entry.disabled ? -1 : index))
    .filter((index) => index >= 0);
}

export function nextFocusableCommandIndex(
  candidates: readonly number[],
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

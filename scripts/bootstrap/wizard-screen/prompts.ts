export function clampIndex(index: number, length: number): number {
  if (length <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(length - 1, index));
}

export function buildTextPromptSubtitle(
  defaultValue: string,
  secret?: boolean,
): string {
  return defaultValue
    ? `Default: ${secret ? "[stored]" : defaultValue}`
    : "Enter to keep current";
}

export function buildTextPromptFooter(
  formatKeyLabel: (label: string) => string,
): string {
  return ` Type and press Enter to save  |  Esc keeps current  |  ${formatKeyLabel("Ctrl-C")} exits `;
}

export function buildYesNoItems(defaultValue: boolean): string[] {
  return [
    `Yes${defaultValue ? " (default)" : ""}`,
    `No${!defaultValue ? " (default)" : ""}`,
  ];
}

export function buildYesNoFooter(): string {
  return " ↑/↓ move  |  Enter or Space confirm  |  Esc keeps current ";
}

export function buildSelectOneFooter(): string {
  return " ↑/↓ move  |  Enter or Space confirm  |  Esc keeps current ";
}

export function buildSelectManyFooter(): string {
  return " ↑/↓ move  |  Space toggle  |  Enter confirm  |  Esc keeps current ";
}

export function buildSelectNumericKeyLabels(length: number): string[] {
  return Array.from({ length }, (_unused, index) => String(index + 1));
}

export function toggleSelection<T>(active: Set<T>, value: T): Set<T> {
  const next = new Set(active);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}

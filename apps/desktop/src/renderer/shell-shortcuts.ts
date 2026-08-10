interface ShortcutTargetLike {
  tagName?: unknown;
  isContentEditable?: unknown;
  parentElement?: ShortcutTargetLike | null;
  getAttribute?: (name: string) => string | null;
}

export interface ShellShortcutEventLike {
  altKey?: boolean;
  ctrlKey?: boolean;
  isComposing?: boolean;
  key?: string;
  metaKey?: boolean;
  shiftKey?: boolean;
  target?: EventTarget | ShortcutTargetLike | null;
}

export function isChatTerminalShortcut(event: ShellShortcutEventLike): boolean {
  return Boolean(
    !event.isComposing &&
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      !event.shiftKey &&
      event.key?.toLowerCase() === "j",
  );
}

export function isEditableShortcutTarget(target: unknown): boolean {
  let current =
    target && typeof target === "object"
      ? (target as ShortcutTargetLike)
      : null;
  while (current) {
    const tagName =
      typeof current.tagName === "string" ? current.tagName.toLowerCase() : "";
    if (["input", "textarea", "select"].includes(tagName)) return true;
    const contentEditable = current.getAttribute?.("contenteditable");
    if (
      current.isContentEditable === true ||
      (contentEditable !== undefined &&
        contentEditable !== null &&
        contentEditable.toLowerCase() !== "false")
    ) {
      return true;
    }
    current = current.parentElement ?? null;
  }
  return false;
}

export function shouldIgnoreShellShortcut(
  event: ShellShortcutEventLike,
): boolean {
  return Boolean(event.isComposing || isEditableShortcutTarget(event.target));
}

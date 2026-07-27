import type { KeyboardEvent, ReactNode } from "react";

export interface ShortcutHintProps {
  keys: readonly string[];
  className?: string;
}

export function ShortcutHint({
  keys,
  className = "command-shortcut",
}: ShortcutHintProps): ReactNode {
  if (keys.length === 0) {
    return null;
  }

  const seen = new Map<string, number>();

  return (
    <span className={className} aria-hidden="true">
      {keys.map((key, index) => {
        const occurrence = seen.get(key) ?? 0;
        seen.set(key, occurrence + 1);
        return (
          <span
            key={`${key}:${occurrence}`}
            className="command-shortcut__group"
          >
            {index > 0 ? (
              <span className="command-shortcut__separator"> </span>
            ) : null}
            <kbd className="command-shortcut__key">{key}</kbd>
          </span>
        );
      })}
    </span>
  );
}

export function useShortcutHintKeyboardActivation(
  keys: readonly string[],
  callback: () => void,
): (event: KeyboardEvent<HTMLElement>) => void {
  const normalized = keys.map((raw) => raw.toLowerCase().trim());

  return (event) => {
    const pressed = [] as string[];

    if (event.metaKey) pressed.push("meta");
    if (event.ctrlKey) pressed.push("ctrl");
    if (event.altKey) pressed.push("alt");
    if (event.shiftKey) pressed.push("shift");
    pressed.push(event.key.toLowerCase());

    const signature = pressed.join("+");
    if (normalized.includes(signature)) {
      event.preventDefault();
      callback();
    }
  };
}

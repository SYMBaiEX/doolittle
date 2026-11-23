import type { ReactNode } from "react";
import { COMMAND_SHORTCUT_KEY_CLASS } from "../app-shell/overlay-layout";

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
            <kbd className={COMMAND_SHORTCUT_KEY_CLASS}>{key}</kbd>
          </span>
        );
      })}
    </span>
  );
}

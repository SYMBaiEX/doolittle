import type { LucideIcon } from "lucide-react";
import type { KeyboardEvent } from "react";
import { UiIcon } from "../components/UiIcon";
import {
  CODING_TAB_BUTTON_CLASS,
  CODING_TAB_SELECTED_CLASS,
  CODING_TABS_CLASS,
} from "./layout";

export function PaneTabs<T extends string>({
  label,
  options,
  panelId,
  value,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<{
    id: T;
    label: string;
    count?: number;
    icon?: LucideIcon;
  }>;
  panelId: string;
  value: T;
  onChange: (value: T) => void;
}) {
  const selectAt = (index: number) => {
    const option = options[index];
    if (option) onChange(option.id);
  };
  const focusAt = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    selectAt(index);
    const tabs =
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
        'button[role="tab"]',
      );
    requestAnimationFrame(() => tabs?.[index]?.focus());
  };

  return (
    <div aria-label={label} className={CODING_TABS_CLASS} role="tablist">
      {options.map((option, index) => (
        <button
          aria-controls={panelId}
          aria-selected={value === option.id}
          className={`${CODING_TAB_BUTTON_CLASS} ${value === option.id ? CODING_TAB_SELECTED_CLASS : ""}`}
          id={paneTabId(panelId, option.id)}
          key={option.id}
          onClick={() => onChange(option.id)}
          onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
            if (event.key === "ArrowRight" || event.key === "ArrowDown") {
              event.preventDefault();
              focusAt(event, (index + 1) % options.length);
            } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
              event.preventDefault();
              focusAt(event, (index - 1 + options.length) % options.length);
            } else if (event.key === "Home") {
              event.preventDefault();
              focusAt(event, 0);
            } else if (event.key === "End") {
              event.preventDefault();
              focusAt(event, options.length - 1);
            }
          }}
          role="tab"
          tabIndex={value === option.id ? 0 : -1}
          type="button"
        >
          {option.icon ? <UiIcon icon={option.icon} size="xs" /> : null}
          <span className="coding-tab-label">{option.label}</span>
          {option.count === undefined ? null : (
            <span className="coding-tab-count">{option.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function paneTabId(panelId: string, tabId: string): string {
  return `${panelId}-tab-${tabId}`;
}

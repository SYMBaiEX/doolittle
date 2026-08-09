import type { KeyboardEvent } from "react";

export function PaneTabs<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<{ id: T; label: string; count?: number }>;
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
    <div aria-label={label} className="coding-tabs" role="tablist">
      {options.map((option, index) => (
        <button
          aria-selected={value === option.id}
          className={value === option.id ? "selected" : ""}
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
          {option.label}
          {option.count === undefined ? null : <span>{option.count}</span>}
        </button>
      ))}
    </div>
  );
}

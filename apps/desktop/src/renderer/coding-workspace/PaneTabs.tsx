import type { LucideIcon } from "lucide-react";
import { PanelTabs, panelTabId } from "../components/PanelTabs";
import { UiIcon } from "../components/UiIcon";

export { panelTabId as paneTabId };

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
  return (
    <PanelTabs
      id={panelId}
      label={label}
      items={options.map((option) => ({
        id: option.id,
        panelId,
        label: (
          <>
            {option.icon ? <UiIcon icon={option.icon} size="xs" /> : null}
            <span className="coding-tab-label">{option.label}</span>
            {option.count === undefined ? null : (
              <span className="text-xs text-[var(--muted)] tabular-nums">
                {option.count}
              </span>
            )}
          </>
        ),
        title: option.label,
      }))}
      selected={value}
      onSelect={onChange}
      variant="pane"
    />
  );
}

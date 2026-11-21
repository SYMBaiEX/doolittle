import { PanelTabList } from "@doolittle/ui";
import type { LucideIcon } from "lucide-react";
import { panelTabId } from "../components/PanelTabs";
import { UiIcon } from "../components/UiIcon";
import "./pane-tabs.css";

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
    <PanelTabList
      className="coding-tabs ide-pane-tabs"
      label={label}
      items={options.map((option) => ({
        id: option.id,
        buttonId: panelTabId(panelId, option.id),
        panelId,
        label: (
          <>
            {option.icon ? <UiIcon icon={option.icon} size="xs" /> : null}
            <span className="coding-tab-label">{option.label}</span>
            {option.count === undefined ? null : (
              <span className="ide-pane-tab-count" aria-hidden="true">
                {option.count}
              </span>
            )}
          </>
        ),
        title: option.label,
      }))}
      selected={value}
      onSelect={onChange}
      tabClassName="ide-pane-tab"
    />
  );
}

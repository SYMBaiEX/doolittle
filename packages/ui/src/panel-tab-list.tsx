import { Tabs, TabsList, TabsTrigger } from "@elizaos/ui/components/ui/tabs";
import type { ReactElement, ReactNode } from "react";

interface PanelTab<T> {
  id: T;
  label: ReactNode;
  buttonId: string;
  panelId: string;
  title?: string;
}

export function PanelTabList<T extends string>({
  items,
  selected,
  onSelect,
  label,
  className,
  tabClassName = "",
  wrapTab,
}: {
  items: readonly PanelTab<T>[];
  selected: T;
  onSelect: (id: T) => void;
  label: string;
  className: string;
  tabClassName?: string;
  wrapTab?: (item: PanelTab<T>, trigger: ReactElement) => ReactElement;
}) {
  return (
    <Tabs activationMode="manual" asChild value={selected}>
      <TabsList
        aria-label={label}
        className={`h-auto justify-start rounded-none bg-transparent ${className}`}
      >
        {items.map((item) => {
          const trigger = (
            <TabsTrigger
              aria-controls={item.panelId}
              className={`focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=active]:bg-transparent data-[state=active]:text-inherit ${tabClassName}`}
              id={item.buttonId}
              key={item.id}
              title={item.title}
              // Radix handles focus. Native click also covers touch, keyboard,
              // and assistive activation without selecting on pointer press.
              onClick={(event) => {
                if (item.id !== selected && !event.ctrlKey) onSelect(item.id);
              }}
              value={item.id}
            >
              {item.label}
            </TabsTrigger>
          );
          return wrapTab ? wrapTab(item, trigger) : trigger;
        })}
      </TabsList>
    </Tabs>
  );
}

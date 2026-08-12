import type {
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
  RefObject,
} from "react";
import { PanelResizeHandle } from "../components/PanelResizeHandle";
import { UtilityDrawer } from "../components/UtilityDrawer";
import {
  type NavigationSectionId,
  navigation,
  VIEW_DESCRIPTIONS,
  type View,
} from "../desktop-navigation";
import { Icon } from "../lib";
import { UTILITY_DRAWER_WIDTH } from "../panel-layout";

export interface DesktopUtilityLayerProps {
  activeView: View;
  activity: ReactNode;
  openSections: ReadonlySet<NavigationSectionId>;
  utilityDrawerWidth: number;
  utilityRef: RefObject<HTMLElement | null>;
  onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
  onClose: () => void;
  onPreload: (view: View) => void;
  onSelect: (view: View) => void;
  onToggleSection: (sectionId: NavigationSectionId) => void;
  onResize: (width: number) => void;
}

export function DesktopUtilityLayer({
  activeView,
  activity,
  openSections,
  utilityDrawerWidth,
  utilityRef,
  onKeyDown,
  onClose,
  onPreload,
  onSelect,
  onToggleSection,
  onResize,
}: DesktopUtilityLayerProps) {
  return (
    <div className="utility-layer">
      <aside
        aria-label="Tools and settings"
        className="utility-drawer"
        onKeyDown={onKeyDown}
        ref={utilityRef}
        tabIndex={-1}
      >
        <UtilityDrawer
          activeView={activeView}
          activity={activity}
          onClose={onClose}
          onPreload={onPreload}
          onSelect={onSelect}
          onToggleSection={(sectionId) =>
            onToggleSection(sectionId as NavigationSectionId)
          }
          openSections={openSections}
          sections={navigation.map((section) => ({
            ...section,
            items: section.items.map((item) => ({
              ...item,
              description: VIEW_DESCRIPTIONS[item.id],
              icon: (
                <Icon name={item.id === "gateway" ? "activity" : item.id} />
              ),
            })),
          }))}
        >
          <PanelResizeHandle
            bounds={UTILITY_DRAWER_WIDTH}
            className="utility-drawer-resizer"
            direction="grow-left"
            label="Resize tools and settings panel"
            onResize={onResize}
            value={utilityDrawerWidth}
          />
        </UtilityDrawer>
      </aside>
    </div>
  );
}

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
  mobileModal: boolean;
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
  mobileModal,
  onKeyDown,
  onClose,
  onPreload,
  onSelect,
  onToggleSection,
  onResize,
}: DesktopUtilityLayerProps) {
  const accessibility = mobileModal
    ? { "aria-modal": true, role: "dialog" as const }
    : { role: "complementary" as const };

  return (
    <>
      {mobileModal ? (
        <button
          aria-label="Close tools and settings"
          className="fixed inset-0 z-119 block h-svh w-screen border-0 bg-[color-mix(in_srgb,var(--shadow)_24%,transparent)] p-0"
          data-utility-backdrop=""
          onClick={onClose}
          tabIndex={-1}
          type="button"
        />
      ) : null}
      <div
        className={
          mobileModal
            ? "fixed inset-y-0 right-0 z-120 min-h-0 w-[min(var(--utility-drawer-width),calc(100vw-24px))] min-w-0 overflow-hidden"
            : "relative z-15 min-h-0 min-w-0 overflow-hidden border-[var(--line-subtle)] border-l bg-[var(--surface)]"
        }
        data-utility-layer=""
      >
        <aside
          aria-label="Tools and settings"
          className={`relative flex h-full min-w-0 flex-col bg-[var(--surface)] text-[var(--text)] ${
            mobileModal
              ? "border-[var(--line-subtle)] border-l shadow-[-8px_0_28px_color-mix(in_srgb,var(--shadow)_18%,transparent)]"
              : "border-0 shadow-none"
          }`}
          data-utility-drawer=""
          onKeyDown={onKeyDown}
          ref={utilityRef}
          tabIndex={-1}
          {...accessibility}
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
              className="inset-y-0 -left-1.25 z-4 max-[700px]:hidden"
              direction="grow-left"
              label="Resize tools and settings panel"
              onResize={onResize}
              value={utilityDrawerWidth}
            />
          </UtilityDrawer>
        </aside>
      </div>
    </>
  );
}

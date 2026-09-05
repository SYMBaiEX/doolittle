import type {
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
  RefObject,
} from "react";
import { PanelResizeHandle } from "../components/PanelResizeHandle";
import { Icon } from "../lib";
import { UTILITY_DRAWER_WIDTH } from "../panel-layout";

export interface DesktopUtilityLayerProps {
  activity: ReactNode;
  utilityDrawerWidth: number;
  utilityRef: RefObject<HTMLElement | null>;
  mobileModal: boolean;
  onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
  onClose: () => void;
  onResize: (width: number) => void;
}

export function DesktopUtilityLayer({
  activity,
  utilityDrawerWidth,
  utilityRef,
  mobileModal,
  onKeyDown,
  onClose,
  onResize,
}: DesktopUtilityLayerProps) {
  const accessibility = mobileModal
    ? { "aria-modal": true, role: "dialog" as const }
    : { role: "complementary" as const };

  return (
    <>
      {mobileModal ? (
        <button
          aria-label="Close Activity"
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
          aria-label="Activity"
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
          <header className="flex min-h-16 items-center justify-between gap-3 border-[var(--line-subtle)] border-b bg-[var(--surface-soft)] px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid size-7 shrink-0 place-items-center rounded-[7px] border border-[color-mix(in_srgb,var(--accent)_27%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_9%,var(--surface))] text-[var(--accent)]">
                <Icon name="activity" />
              </span>
              <div className="grid min-w-0 gap-px">
                <span className="eyebrow">Runtime {"//"}</span>
                <h2
                  className="m-0 font-semibold text-sm text-[var(--text)] tracking-[-0.015em] [font-family:var(--font-display)]"
                  id="utility-drawer-title"
                >
                  Activity
                </h2>
              </div>
            </div>
            <button
              aria-label="Close Activity"
              className="grid size-6.5 place-items-center rounded-[var(--radius-sm)] border border-transparent bg-transparent text-[var(--muted)] hover:border-[var(--border)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent-border)]"
              onClick={onClose}
              type="button"
            >
              <span aria-hidden="true">×</span>
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 pt-1.75 pb-3 [scrollbar-gutter:stable]">
            {activity}
          </div>
          <footer className="shrink-0 border-[var(--line-subtle)] border-t px-3 py-2">
            <a
              className="inline-flex min-h-7 items-center rounded-[var(--radius-sm)] px-1.5 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--surface-hover)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-border)]"
              href="#/home/activity"
              onClick={onClose}
            >
              View all
            </a>
          </footer>
          <PanelResizeHandle
            bounds={UTILITY_DRAWER_WIDTH}
            className="inset-y-0 -left-1.25 z-4 max-[700px]:hidden"
            direction="grow-left"
            label="Resize Activity panel"
            onResize={onResize}
            value={utilityDrawerWidth}
          />
        </aside>
      </div>
    </>
  );
}

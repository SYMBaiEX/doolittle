import { AlertCircle, Terminal } from "lucide-react";
import type { RefObject } from "react";
import { InlineActionConfirmation } from "./InlineActionConfirmation";
import { INTERACTIVE_TERMINAL_PRIMARY_BUTTON_CLASS } from "./interactive-terminal-layout";
import type { InteractiveTerminalTabState } from "./interactive-terminal-store";
import { UiIcon } from "./UiIcon";

export function InteractiveTerminalSurface({
  active,
  activeTab,
  notice,
  onStart,
  onRetryOutput,
  canRetryOutput,
  pendingStart = false,
  discardConfirmation,
  running,
  starting,
  panelId,
  viewportRef,
}: {
  active: boolean;
  activeTab?: InteractiveTerminalTabState;
  notice: string;
  onStart: () => void;
  onRetryOutput: () => void;
  canRetryOutput: boolean;
  pendingStart?: boolean;
  discardConfirmation?: {
    tabName: string;
    onCancel: () => void;
    onConfirm: () => void;
  } | null;
  running: boolean;
  starting: boolean;
  panelId: string;
  viewportRef: RefObject<HTMLDivElement | null>;
}) {
  const outputNotice =
    notice ||
    (activeTab?.stale
      ? "Shell unavailable. Open a new shell to continue."
      : "");
  return (
    <div className="interactive-terminal-surface">
      {discardConfirmation ? (
        <div className="interactive-terminal-confirmation">
          <InlineActionConfirmation
            busy={false}
            busyLabel="Discarding…"
            confirmLabel="Discard tab only"
            detail="This removes the tab and its recovery ID, not the shell. The shell may still be running. Use Stop work or quit Doolittle to shut it down."
            onCancel={discardConfirmation.onCancel}
            onConfirm={discardConfirmation.onConfirm}
            title={`Discard ${discardConfirmation.tabName} tab only?`}
          />
        </div>
      ) : outputNotice ? (
        <div className="interactive-terminal-notice" role="status">
          <UiIcon icon={AlertCircle} size="xs" />
          <span
            className="interactive-terminal-notice-label"
            title={outputNotice}
          >
            {outputNotice}
          </span>
          {canRetryOutput ? (
            <button
              className="interactive-terminal-retry"
              onClick={onRetryOutput}
              type="button"
            >
              Retry output
            </button>
          ) : null}
        </div>
      ) : null}
      <div
        aria-label={activeTab ? undefined : "Terminal output"}
        aria-labelledby={
          activeTab ? `${panelId}-${activeTab.id}-tab` : undefined
        }
        aria-live="off"
        className="interactive-terminal-viewport"
        id={panelId}
        ref={viewportRef}
        role="tabpanel"
      />
      {!running && !activeTab?.output ? (
        <div className="interactive-terminal-empty">
          <UiIcon icon={Terminal} />
          <span>Workspace shell</span>
          <button
            className={INTERACTIVE_TERMINAL_PRIMARY_BUTTON_CLASS}
            disabled={!active || starting}
            onClick={onStart}
            type="button"
          >
            {starting
              ? "Opening…"
              : pendingStart
                ? "Retry shell request"
                : "Open shell"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

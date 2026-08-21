import { Terminal } from "lucide-react";
import type { RefObject } from "react";
import { INTERACTIVE_TERMINAL_PRIMARY_BUTTON_CLASS } from "./interactive-terminal-layout";
import { terminalTabLabelId } from "./interactive-terminal-state";
import type { InteractiveTerminalTabState } from "./interactive-terminal-store";
import { UiIcon } from "./UiIcon";

export function InteractiveTerminalSurface({
  active,
  activeTab,
  notice,
  onStart,
  running,
  starting,
  viewportRef,
}: {
  active: boolean;
  activeTab?: InteractiveTerminalTabState;
  notice: string;
  onStart: () => void;
  running: boolean;
  starting: boolean;
  viewportRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="relative min-h-0 min-w-0 overflow-hidden bg-[var(--canvas-bg)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-3 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--accent)_2.5%,transparent),transparent_32%),repeating-linear-gradient(0deg,transparent_0,transparent_3px,color-mix(in_srgb,var(--canvas-text)_1.4%,transparent)_4px)]"
      />
      <div
        aria-label="Terminal output"
        aria-labelledby={
          activeTab ? terminalTabLabelId(activeTab.id) : undefined
        }
        aria-live="off"
        className="absolute inset-0 z-2 m-0 min-h-0 min-w-0 overflow-hidden border-0 bg-transparent p-0 font-mono text-[var(--canvas-text)] outline-0 [scrollbar-color:var(--accent-border)_transparent] [scrollbar-width:thin] focus-visible:shadow-[inset_2px_0_var(--accent)] [&_.xterm]:h-full [&_.xterm]:p-2 [&_.xterm-helper-textarea]:opacity-[0.01] [&_.xterm-screen]:will-change-auto [&_.xterm-viewport]:!bg-[var(--canvas-bg)] [&_.xterm-viewport]:overscroll-contain [&_.xterm-viewport]:[scrollbar-color:var(--accent-border)_transparent] [&_.xterm-viewport]:[scrollbar-width:thin]"
        id={
          activeTab ? `interactive-terminal-${activeTab.id}-panel` : undefined
        }
        ref={viewportRef}
        role="tabpanel"
      />
      {!running && !activeTab?.output ? (
        <div className="absolute inset-0 z-4 flex flex-col items-center justify-center bg-[color-mix(in_srgb,var(--canvas-bg)_92%,transparent)] p-6 text-center text-[var(--muted)]">
          <span className="mb-2.5 grid size-9 place-items-center rounded-[var(--radius-xs)] border border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)] shadow-[0_0_28px_color-mix(in_srgb,var(--accent)_12%,transparent)]">
            <UiIcon icon={Terminal} size="md" />
          </span>
          <strong className="text-[13px] text-[var(--text)]">
            Workspace shell
          </strong>
          <p className="mt-1 mb-3 max-w-64 text-[10px] leading-normal">
            Native {activeTab?.shell || "shell"} PTY · output and tabs stay with
            this workspace.
          </p>
          <button
            className={INTERACTIVE_TERMINAL_PRIMARY_BUTTON_CLASS}
            disabled={!active || starting}
            onClick={onStart}
            type="button"
          >
            {starting ? "Opening…" : "Open shell"}
          </button>
        </div>
      ) : null}
      {notice || activeTab?.stale ? (
        <p
          className="absolute bottom-2 left-2 z-4 m-0 max-w-[min(34rem,calc(100%-1rem))] truncate rounded-[var(--radius-xs)] border border-[color-mix(in_srgb,var(--warn)_30%,var(--border))] bg-[var(--warn-soft)] px-2 py-1 font-mono text-[10px] text-[var(--warn)]"
          role="status"
          title={notice}
        >
          {notice ||
            "Session ended on workspace change. Open a new shell to continue."}
        </p>
      ) : null}
    </div>
  );
}

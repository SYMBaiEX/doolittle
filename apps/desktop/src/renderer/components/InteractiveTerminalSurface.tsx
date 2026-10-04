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
        aria-label="Terminal output"
        aria-labelledby={
          activeTab ? terminalTabLabelId(activeTab.id) : undefined
        }
        aria-live="off"
        className="absolute inset-0 z-2 m-0 min-h-0 min-w-0 overflow-hidden border-0 bg-transparent p-0 font-mono text-[var(--canvas-text)] outline-0 [scrollbar-color:var(--accent-border)_transparent] [scrollbar-width:thin] focus-visible:shadow-[inset_2px_0_var(--accent)] [&_.xterm]:box-border [&_.xterm]:h-full [&_.xterm]:w-full [&_.xterm]:px-1.5 [&_.xterm]:pt-0.75 [&_.xterm]:pb-1.25 [&_.xterm-helper-textarea]:opacity-[0.01] [&_.xterm-screen]:will-change-auto [&_.xterm-screen]:pb-1 [&_.xterm-viewport]:!bg-[var(--canvas-bg)] [&_.xterm-viewport]:overscroll-contain [&_.xterm-viewport]:pr-0.5 [&_.xterm-viewport]:[scrollbar-color:var(--accent-border)_transparent] [&_.xterm-viewport]:[scrollbar-width:thin]"
        id={
          activeTab ? `interactive-terminal-${activeTab.id}-panel` : undefined
        }
        ref={viewportRef}
        role="tabpanel"
      />
      {!running && !activeTab?.output ? (
        <div className="absolute inset-0 z-4 flex flex-col items-center justify-center bg-[var(--canvas-bg)] p-6 text-center text-[var(--muted)]">
          <span className="mb-2.5 grid size-9 place-items-center rounded-[var(--radius-xs)] border border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]">
            <UiIcon icon={Terminal} size="md" />
          </span>
          <strong className="text-[length:var(--text-body)] text-[var(--text)]">
            Workspace shell
          </strong>
          <p className="mt-1 mb-3 max-w-64 text-[length:var(--text-control)] leading-normal">
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
          className="absolute right-1.5 bottom-1.5 z-4 m-0 max-w-[min(30rem,calc(100%-1rem))] rounded-[var(--radius-xs)] border border-[var(--warn)] bg-[var(--warn-soft)] px-2 py-1 font-mono text-[length:var(--text-meta)] text-[var(--warn)]"
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

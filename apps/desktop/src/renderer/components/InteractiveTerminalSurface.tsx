import type { Dispatch, RefObject, SetStateAction } from "react";
import {
  INTERACTIVE_TERMINAL_BUTTON_CLASS,
  INTERACTIVE_TERMINAL_CHROME_CLASS,
  INTERACTIVE_TERMINAL_PRIMARY_BUTTON_CLASS,
} from "./interactive-terminal-layout";
import {
  terminalChatContext,
  terminalTabLabelId,
} from "./interactive-terminal-state";
import type { InteractiveTerminalTabState } from "./interactive-terminal-store";

export function InteractiveTerminalSurface({
  active,
  activeTab,
  notice,
  onSendToChat,
  onStart,
  running,
  setTabs,
  starting,
  viewportRef,
}: {
  active: boolean;
  activeTab?: InteractiveTerminalTabState;
  notice: string;
  onSendToChat: (text: string) => void;
  onStart: () => void;
  running: boolean;
  setTabs: Dispatch<SetStateAction<InteractiveTerminalTabState[]>>;
  starting: boolean;
  viewportRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <>
      <div className="relative min-h-0 min-w-0 overflow-hidden bg-[var(--canvas-bg)]">
        <div
          aria-label="Terminal output"
          aria-labelledby={
            activeTab ? terminalTabLabelId(activeTab.id) : undefined
          }
          aria-live="off"
          className="absolute inset-0 m-0 min-h-0 min-w-0 overflow-auto border-0 bg-transparent p-2.5 font-mono text-[var(--canvas-text)] outline-0 [scrollbar-color:var(--accent-border)_transparent] [scrollbar-width:thin] focus-visible:shadow-[inset_2px_0_var(--accent)] [&_.xterm]:h-full [&_.xterm-helper-textarea]:opacity-[0.01] [&_.xterm-viewport]:!bg-[var(--canvas-bg)] [&_.xterm-viewport]:overscroll-contain [&_.xterm-viewport]:[scrollbar-color:var(--accent-border)_transparent] [&_.xterm-viewport]:[scrollbar-width:thin]"
          id={
            activeTab ? `interactive-terminal-${activeTab.id}-panel` : undefined
          }
          ref={viewportRef}
          role="tabpanel"
        />
        {!running && !activeTab?.output ? (
          <div className="absolute inset-0 z-3 flex flex-col items-center justify-center bg-[color-mix(in_srgb,var(--canvas-bg)_92%,transparent)] p-6 text-center text-[var(--muted)]">
            <span
              aria-hidden="true"
              className="mb-2.75 grid size-9.5 place-items-center rounded-[var(--radius-xs)] border border-[var(--accent-border)] bg-[var(--accent-soft)] font-black font-mono text-xs text-[var(--accent)] shadow-[0_0_28px_color-mix(in_srgb,var(--accent)_12%,transparent)]"
            >
              &gt;_
            </span>
            <strong className="text-[13px] text-[var(--text)]">
              Shell ready
            </strong>
            <p className="mt-1.25 mb-3.25 max-w-60 text-[10px] leading-normal">
              Start a native {activeTab?.shell || "shell"} session in this
              repository.
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
      </div>
      <footer
        className={`${INTERACTIVE_TERMINAL_CHROME_CLASS} flex min-h-7.25 items-center justify-between gap-2 border-t px-2.25 py-1`}
      >
        <span className="truncate">
          {notice ||
            (activeTab?.stale
              ? "This terminal session ended when the workspace changed. Start a new shell to continue."
              : "Active tab output is preserved across workspace navigation.")}
        </span>
        <div className="flex shrink-0 gap-1.25">
          <button
            className={INTERACTIVE_TERMINAL_BUTTON_CLASS}
            disabled={!activeTab?.output}
            onClick={() => {
              if (!activeTab) return;
              setTabs((current) =>
                current.map((tab) =>
                  tab.id === activeTab.id ? { ...tab, output: "" } : tab,
                ),
              );
            }}
            type="button"
          >
            Clear view
          </button>
          <button
            className={INTERACTIVE_TERMINAL_BUTTON_CLASS}
            disabled={!activeTab?.output}
            onClick={() => {
              if (activeTab)
                onSendToChat(terminalChatContext(activeTab.output));
            }}
            type="button"
          >
            Add to chat
          </button>
        </div>
      </footer>
    </>
  );
}

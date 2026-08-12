import type { Dispatch, RefObject, SetStateAction } from "react";
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
      <div className="interactive-terminal-stage">
        <div
          aria-label="Terminal output"
          aria-labelledby={
            activeTab ? terminalTabLabelId(activeTab.id) : undefined
          }
          aria-live="off"
          className="interactive-terminal-output"
          id={
            activeTab ? `interactive-terminal-${activeTab.id}-panel` : undefined
          }
          ref={viewportRef}
          role="tabpanel"
        />
        {!running && !activeTab?.output ? (
          <div className="interactive-terminal-launchpad">
            <span aria-hidden="true">&gt;_</span>
            <strong>Shell ready</strong>
            <p>
              Start a native {activeTab?.shell || "shell"} session in this
              repository.
            </p>
            <button
              disabled={!active || starting}
              onClick={onStart}
              type="button"
            >
              {starting ? "Opening…" : "Open shell"}
            </button>
          </div>
        ) : null}
      </div>
      <footer className="interactive-terminal-footer">
        <span>
          {notice ||
            "Active tab output is preserved across workspace navigation."}
          {activeTab?.stale ? " · stale session" : ""}
        </span>
        <div>
          <button
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

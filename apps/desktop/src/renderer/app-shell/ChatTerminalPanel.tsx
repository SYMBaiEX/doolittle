import type { CSSProperties } from "react";
import type { DoolittleDesktopBridge } from "../../shared/contracts";
import { InteractiveTerminal } from "../components/InteractiveTerminal";
import { PanelResizeHandle } from "../components/PanelResizeHandle";
import { CHAT_TERMINAL_HEIGHT } from "../panel-layout";
import "./chat-terminal-panel.css";

export interface ChatTerminalPanelProps {
  active: boolean;
  height: number;
  open: boolean;
  onClose: () => void;
  onResize: (height: number) => void;
  onSendToChat: (text: string) => void;
  platform: DoolittleDesktopBridge["platform"];
  workspacePath: string;
}

export function ChatTerminalPanel({
  active,
  height,
  open,
  onClose,
  onResize,
  onSendToChat,
  platform,
  workspacePath,
}: ChatTerminalPanelProps) {
  const shortcut = platform === "darwin" ? "⌘J" : "Ctrl+J";

  return (
    <section
      aria-label="Chat terminal panel"
      className="chat-terminal-panel"
      data-open={open}
      inert={!open}
      style={
        {
          "--chat-terminal-height": `${height}px`,
        } as CSSProperties
      }
    >
      <PanelResizeHandle
        bounds={CHAT_TERMINAL_HEIGHT}
        className="chat-terminal-panel-resizer"
        direction="grow-up"
        label="Resize chat terminal"
        onResize={onResize}
        value={height}
      />
      <InteractiveTerminal
        active={active && open}
        autoStart
        dismissShortcut={shortcut}
        onDismiss={onClose}
        onSendToChat={onSendToChat}
        workspacePath={workspacePath}
      />
    </section>
  );
}

import type { DoolittleDesktopBridge } from "../../shared/contracts";
import { InteractiveTerminal } from "../components/InteractiveTerminal";
import { PanelResizeHandle } from "../components/PanelResizeHandle";
import { CHAT_TERMINAL_HEIGHT } from "../panel-layout";

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
      className={`relative z-12 min-h-0 min-w-0 shrink-0 origin-bottom overflow-hidden border-t bg-[#0d0b0a] transition-[height,opacity,transform,border-color,visibility] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] contain-[layout_paint_style] backface-hidden will-change-[transform,opacity] [@media(max-height:640px)]:max-h-[48vh] [&>[data-interactive-terminal]]:min-h-0 motion-reduce:transform-none motion-reduce:duration-[0.01ms] motion-reduce:delay-0 ${
        open
          ? "visible max-h-[58vh] translate-y-0 scale-y-100 border-[var(--border-strong)] opacity-100 shadow-[0_-12px_32px_color-mix(in_srgb,#000_18%,transparent)] pointer-events-auto"
          : "invisible translate-y-3 scale-y-[0.985] border-transparent opacity-0 pointer-events-none"
      }`}
      data-open={open}
      inert={!open}
      style={{ height: `${open ? height : 0}px` }}
    >
      <PanelResizeHandle
        bounds={CHAT_TERMINAL_HEIGHT}
        className="-top-[5px] inset-x-0"
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

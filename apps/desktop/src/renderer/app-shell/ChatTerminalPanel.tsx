import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DoolittleDesktopBridge } from "../../shared/contracts";
import { Button } from "../components/ElizaControls";
import { InteractiveTerminal } from "../components/InteractiveTerminal";
import { PanelResizeHandle } from "../components/PanelResizeHandle";
import { useModalFocusBoundary } from "../components/useModalFocusBoundary";
import { type ComputerOrigin, computerOriginKey } from "../computer-origin";
import { CHAT_TERMINAL_HEIGHT, clampPanelSize } from "../panel-layout";

const SHORT_VIEWPORT_MAX_HEIGHT = 640;
const CHAT_TERMINAL_TALL_VIEWPORT_RATIO = 0.58;
const CHAT_TERMINAL_SHORT_VIEWPORT_RATIO = 0.48;
const CHAT_TRANSCRIPT_RESERVE = 128;
// The 44px control band also needs its one-pixel panel edge.
const COMPACT_TERMINAL_HEIGHT = 45;

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export function terminalHeightBounds(
  viewportHeight: number | null,
  chatHeightBudget: number | null = null,
) {
  if (viewportHeight === null || !Number.isFinite(viewportHeight))
    return CHAT_TERMINAL_HEIGHT;

  const viewportMax = Math.floor(
    viewportHeight *
      (viewportHeight <= SHORT_VIEWPORT_MAX_HEIGHT
        ? CHAT_TERMINAL_SHORT_VIEWPORT_RATIO
        : CHAT_TERMINAL_TALL_VIEWPORT_RATIO),
  );
  const max = Math.max(
    0,
    Math.min(
      CHAT_TERMINAL_HEIGHT.max,
      viewportMax,
      chatHeightBudget !== null && Number.isFinite(chatHeightBudget)
        ? chatHeightBudget
        : Number.POSITIVE_INFINITY,
    ),
  );

  return {
    default: Math.min(CHAT_TERMINAL_HEIGHT.default, max),
    min: Math.min(CHAT_TERMINAL_HEIGHT.min, max),
    max,
  };
}

export interface ChatTerminalPanelProps {
  active: boolean;
  height: number;
  open: boolean;
  onClose: () => void;
  onResize: (height: number) => void;
  onSendToChat: (text: string) => void;
  platform: DoolittleDesktopBridge["platform"];
  workspacePath: string;
  origin?: ComputerOrigin;
  allowLegacy?: boolean;
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
  origin,
  allowLegacy,
}: ChatTerminalPanelProps) {
  const shortcut = platform === "darwin" ? "⌘J" : "Ctrl+J";
  const panelRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const previousWorkspaceRef = useRef(workspacePath);
  const [geometry, setGeometry] = useState<{
    viewportHeight: number | null;
    chatHeightBudget: number | null;
  }>({ viewportHeight: null, chatHeightBudget: null });
  const [expanded, setExpanded] = useState(false);
  const heightBounds = terminalHeightBounds(
    geometry.viewportHeight,
    geometry.chatHeightBudget,
  );
  const compact = heightBounds.max < CHAT_TERMINAL_HEIGHT.min;
  const modalOpen = open && compact && expanded;
  const dialogRef = useModalFocusBoundary({
    active: modalOpen,
    initialFocusSelector: "[data-terminal-return]",
    isolateBackground: true,
    onClose: () => setExpanded(false),
    restoreFocus: open && compact,
    restoreFocusRef: openerRef,
  });

  useIsomorphicLayoutEffect(() => {
    const panel = panelRef.current;
    const main = panel?.parentElement;
    if (!panel || !main) return;
    const observed = new Set<Element>();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    function observe(element: Element) {
      if (observed.has(element)) return;
      observed.add(element);
      observer?.observe(element);
    }
    function measure() {
      if (!panel || !main) return;
      for (const element of observed) {
        if (main.contains(element)) continue;
        observer?.unobserve(element);
        observed.delete(element);
      }
      const route = main.querySelector<HTMLElement>(
        ':scope > .view-container[data-view="chat"]',
      );
      let chatHeightBudget: number | null = null;
      if (route) {
        observe(route);
        const routeTop = route.getBoundingClientRect().top;
        const dockHeight = panel.getBoundingClientRect().height;
        for (const conversation of route.querySelectorAll<HTMLElement>(
          "[data-session-panel]:not([hidden]) .chat-conversation",
        )) {
          if (conversation.closest("[hidden]")) continue;
          const composer =
            conversation.querySelector<HTMLElement>(".chat-composer");
          if (!composer) continue;
          observe(conversation);
          observe(composer);
          // Restore the route's undocked space, then reserve its real session
          // chrome, the complete composer, and readable transcript space. The
          // scroll offset makes this invariant while navigating short layouts.
          const chrome =
            conversation.getBoundingClientRect().top -
            routeTop +
            route.scrollTop;
          const budget = Math.floor(
            route.clientHeight +
              dockHeight -
              chrome -
              composer.getBoundingClientRect().height -
              (Number.parseFloat(getComputedStyle(composer).marginBottom) ||
                0) -
              CHAT_TRANSCRIPT_RESERVE,
          );
          chatHeightBudget = Math.min(
            chatHeightBudget ?? Number.POSITIVE_INFINITY,
            Math.max(0, budget),
          );
        }
      }
      setGeometry((current) =>
        current.viewportHeight === window.innerHeight &&
        current.chatHeightBudget === chatHeightBudget
          ? current
          : { viewportHeight: window.innerHeight, chatHeightBudget },
      );
    }
    observe(main);
    measure();
    const mutations = new MutationObserver(measure);
    mutations.observe(main, {
      attributeFilter: ["data-view", "hidden", "inert"],
      attributes: true,
      childList: true,
      subtree: true,
    });
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      mutations.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    if (!compact || !open) setExpanded(false);
  }, [compact, open]);
  useEffect(() => {
    if (previousWorkspaceRef.current === workspacePath) return;
    previousWorkspaceRef.current = workspacePath;
    setExpanded(false);
  }, [workspacePath]);

  const effectiveHeight = clampPanelSize(height, heightBounds);

  return (
    <section
      aria-label="Chat terminal panel"
      className={`relative min-h-0 min-w-0 shrink-0 border-t bg-[var(--canvas-bg)] ${compact ? (modalOpen ? "z-110 overflow-visible" : "z-12 overflow-hidden") : "z-12 origin-bottom overflow-hidden transition-[height,opacity,transform,border-color,visibility] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] contain-[layout_paint_style] backface-hidden will-change-[transform,opacity] [@media(max-height:640px)]:max-h-[48vh] motion-reduce:transform-none motion-reduce:duration-[0.01ms] motion-reduce:delay-0"} ${
        open
          ? `visible border-[var(--border-strong)] opacity-100 pointer-events-auto ${compact ? "" : "max-h-[58vh] translate-y-0 scale-y-100 shadow-[0_-12px_32px_color-mix(in_srgb,var(--shadow)_18%,transparent)]"}`
          : `invisible border-transparent opacity-0 pointer-events-none ${compact ? "" : "translate-y-3 scale-y-[0.985]"}`
      }`}
      data-compact={compact}
      data-open={open}
      inert={!open}
      ref={panelRef}
      style={{
        height: `${open ? (compact ? COMPACT_TERMINAL_HEIGHT : effectiveHeight) : 0}px`,
      }}
    >
      {compact ? (
        <div className="flex h-11 items-center gap-1 px-1">
          <Button
            aria-expanded={modalOpen}
            aria-haspopup="dialog"
            className="!h-11 !min-h-11 min-w-0 flex-1 justify-start !text-[var(--canvas-text)] hover:!bg-[var(--canvas-border)]"
            onClick={() => setExpanded(true)}
            ref={openerRef}
            type="button"
            variant="ghost"
          >
            Open terminal <span className="ml-auto">{shortcut}</span>
          </Button>
          <Button
            aria-label="Close terminal panel"
            className="!h-11 !min-h-11 min-w-11 !text-[var(--canvas-text)] hover:!bg-[var(--canvas-border)]"
            onClick={onClose}
            type="button"
            variant="ghost"
          >
            Close
          </Button>
        </div>
      ) : (
        <PanelResizeHandle
          bounds={heightBounds}
          className="-top-[5px] inset-x-0"
          controls="chat-terminal-panel"
          direction="grow-up"
          label="Resize chat terminal"
          onResize={onResize}
          value={effectiveHeight}
        />
      )}
      <div
        id="chat-terminal-panel"
        {...(modalOpen
          ? {
              "aria-label": "Chat terminal",
              "aria-modal": true,
              role: "dialog",
              tabIndex: -1,
            }
          : { "aria-label": "Chat terminal", role: "region" })}
        className={
          compact
            ? modalOpen
              ? "fixed inset-0 flex min-h-0 flex-col bg-[var(--canvas-bg)] text-[var(--canvas-text)]"
              : "hidden"
            : "h-full min-h-0 [&>[data-interactive-terminal]]:min-h-0"
        }
        inert={compact && !modalOpen}
        ref={dialogRef}
      >
        {modalOpen ? (
          <Button
            className="!h-11 !min-h-11 shrink-0 self-start !text-[var(--canvas-text)] hover:!bg-[var(--canvas-border)]"
            data-terminal-return
            onClick={() => setExpanded(false)}
            type="button"
            variant="ghost"
          >
            Back to workspace
          </Button>
        ) : null}
        <div className="min-h-0 flex-1 h-full [&>[data-interactive-terminal]]:min-h-0">
          <InteractiveTerminal
            key={`${computerOriginKey(origin)}:${workspacePath}`}
            active={active && open && (!compact || modalOpen)}
            autoStart
            dismissShortcut={shortcut}
            onDismiss={compact ? () => setExpanded(false) : onClose}
            onSendToChat={onSendToChat}
            workspacePath={workspacePath}
            origin={origin}
            allowLegacy={allowLegacy}
          />
        </div>
      </div>
    </section>
  );
}

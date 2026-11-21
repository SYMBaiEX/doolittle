import { ArrowLeft, PanelBottomClose, Terminal } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DoolittleDesktopBridge } from "../../shared/contracts";
import { InteractiveTerminal } from "../components/InteractiveTerminal";
import { PanelResizeHandle } from "../components/PanelResizeHandle";
import { UiIcon } from "../components/UiIcon";
import { useModalFocusBoundary } from "../components/useModalFocusBoundary";
import { type ComputerOrigin, computerOriginKey } from "../computer-origin";
import { CHAT_TERMINAL_HEIGHT, clampPanelSize } from "../panel-layout";
import "./chat-terminal-dock.css";

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
  focusRequest?: number;
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
  focusRequest,
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
  const lastFocusRequest = useRef<number | undefined>(undefined);
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
  const terminalVisible = open && (!compact || modalOpen);
  const dialogRef = useModalFocusBoundary({
    active: modalOpen,
    initialFocusSelector: "[data-terminal-return]",
    isolateBackground: true,
    onClose: () => setExpanded(false),
    restoreFocus: open && compact,
    restoreFocusRef: openerRef,
  });

  useIsomorphicLayoutEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const main = panel?.parentElement;
    if (!panel || !main) return;
    let frame: number | null = null;
    const observed = new Set<Element>();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(scheduleMeasure);
    function scheduleMeasure() {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        measure();
      });
    }
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
    const mutations = new MutationObserver((entries) => {
      if (entries.some(({ target }) => !panel.contains(target)))
        scheduleMeasure();
    });
    mutations.observe(main, {
      attributeFilter: ["data-view", "hidden", "inert"],
      attributes: true,
      childList: true,
      subtree: true,
    });
    window.addEventListener("resize", scheduleMeasure);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      observer?.disconnect();
      mutations.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
    };
  }, [open]);

  useEffect(() => {
    if (!compact || !open) setExpanded(false);
  }, [compact, open]);
  useEffect(() => {
    if (previousWorkspaceRef.current === workspacePath) return;
    previousWorkspaceRef.current = workspacePath;
    setExpanded(false);
  }, [workspacePath]);
  useEffect(() => {
    if (
      !open ||
      focusRequest === undefined ||
      focusRequest === lastFocusRequest.current
    )
      return;
    lastFocusRequest.current = focusRequest;
    if (compact) setExpanded(true);
  }, [compact, focusRequest, open]);

  const effectiveHeight = clampPanelSize(height, heightBounds);

  return (
    <section
      aria-label="Chat terminal panel"
      aria-hidden={!open || undefined}
      className="chat-terminal-dock"
      data-compact={compact}
      data-chat-terminal-panel=""
      data-expanded={modalOpen}
      data-open={open}
      inert={!open}
      ref={panelRef}
      style={{
        height: `${open ? (compact ? COMPACT_TERMINAL_HEIGHT : effectiveHeight) : 0}px`,
      }}
    >
      {compact ? (
        <div className="chat-terminal-compact-toolbar">
          <button
            aria-expanded={modalOpen}
            aria-haspopup="dialog"
            aria-label="Open terminal"
            className="chat-terminal-expand"
            onClick={() => setExpanded(true)}
            ref={openerRef}
            type="button"
          >
            <UiIcon icon={Terminal} />
            <span>Open terminal</span>
            <kbd>{shortcut}</kbd>
          </button>
          <button
            aria-label="Close terminal panel"
            onClick={onClose}
            title="Hide terminal"
            type="button"
          >
            <UiIcon icon={PanelBottomClose} />
          </button>
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
        className="chat-terminal-workbench"
        data-modal={modalOpen || undefined}
        hidden={compact && !modalOpen}
        inert={compact && !modalOpen}
        ref={dialogRef}
      >
        {modalOpen ? (
          <button
            className="chat-terminal-return"
            data-terminal-return
            onClick={() => setExpanded(false)}
            type="button"
          >
            <UiIcon icon={ArrowLeft} />
            Back to workspace
          </button>
        ) : null}
        <div className="chat-terminal-shell">
          <InteractiveTerminal
            key={`${computerOriginKey(origin)}:${workspacePath}`}
            active={active && terminalVisible}
            autoStart
            dismissShortcut={shortcut}
            focusRequest={focusRequest}
            onDismiss={compact ? () => setExpanded(false) : onClose}
            onSendToChat={onSendToChat}
            workspacePath={workspacePath}
            origin={origin}
            allowLegacy={allowLegacy}
            visible={terminalVisible}
          />
        </div>
      </div>
    </section>
  );
}

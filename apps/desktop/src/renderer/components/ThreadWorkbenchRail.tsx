import {
  Activity,
  FileCode2,
  GitBranch,
  GitCompareArrows,
  ListTodo,
  type LucideIcon,
  MonitorPlay,
  RefreshCw,
  Settings2,
  SquareTerminal,
  X,
} from "lucide-react";
import { type CSSProperties, type KeyboardEvent, useRef } from "react";
import { asNumber, Badge } from "../lib";
import {
  clampThreadWorkbenchWidth,
  THREAD_WORKBENCH_DEFAULT_WIDTH,
  THREAD_WORKBENCH_MAX_WIDTH,
  THREAD_WORKBENCH_MIN_WIDTH,
  THREAD_WORKBENCH_TABS,
  type ThreadWorkbenchTab,
} from "../thread-workbench";
import {
  WORKBENCH_CONTEXT_COPY_CLASS,
  WORKBENCH_CONTEXT_META_CLASS,
  WORKBENCH_CONTEXT_PRIMARY_CLASS,
  WORKBENCH_CONTEXT_ROW_CLASS,
  WORKBENCH_FOOTER_CLASS,
  WORKBENCH_HEADER_CLASS,
  WORKBENCH_HEADING_CLASS,
  WORKBENCH_ICON_BUTTON_CLASS,
  WORKBENCH_KICKER_CLASS,
  WORKBENCH_LOCKUP_CLASS,
  WORKBENCH_MARK_CLASS,
  WORKBENCH_RAIL_CLASS,
  WORKBENCH_REPO_MARK_CLASS,
  WORKBENCH_RESIZER_CLASS,
  WORKBENCH_TAB_CLASS,
  WORKBENCH_TAB_MARK_CLASS,
  WORKBENCH_TAB_SELECTED_CLASS,
  WORKBENCH_TAB_SIGNAL_CLASS,
  WORKBENCH_TABS_CLASS,
} from "../thread-workbench/layout";
import {
  branchHeadLabel,
  compactRailLabel,
  TAB_LABELS,
  type ThreadWorkbenchFullView,
} from "../thread-workbench/models";
import { WorkbenchPanels } from "../thread-workbench/WorkbenchPanels";
import { useThreadWorkbenchRailController } from "../thread-workbench-controller";
import { PanelResizeHandle } from "./PanelResizeHandle";
import { UiIcon } from "./UiIcon";

export type { ThreadWorkbenchFullView } from "../thread-workbench/models";

export interface ThreadWorkbenchRailProps {
  active: boolean;
  sessionId: string;
  workspacePath: string;
  onInsertContext: (text: string) => void;
  onOpenFullView: (view: ThreadWorkbenchFullView) => void;
  onRequestClose: () => void;
}

const WORKBENCH_TAB_ICONS: Record<ThreadWorkbenchTab, LucideIcon> = {
  files: FileCode2,
  changes: GitCompareArrows,
  terminal: SquareTerminal,
  plans: ListTodo,
  brief: Activity,
  settings: Settings2,
  preview: MonitorPlay,
};

export function ThreadWorkbenchRail({
  active,
  sessionId,
  workspacePath,
  onInsertContext,
  onOpenFullView,
  onRequestClose,
}: ThreadWorkbenchRailProps) {
  const controller = useThreadWorkbenchRailController({
    active,
    sessionId,
    workspacePath,
    onInsertContext,
  });
  const {
    model,
    setModel,
    copiedLabel,
    repositorySummary,
    selectTab,
    refreshCurrent,
  } = controller;
  const tabRefs = useRef<Record<ThreadWorkbenchTab, HTMLButtonElement | null>>({
    files: null,
    changes: null,
    terminal: null,
    plans: null,
    brief: null,
    settings: null,
    preview: null,
  });
  if (!active) return null;
  const navigateTabs = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let target = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      target = (index + 1) % THREAD_WORKBENCH_TABS.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      target =
        (index - 1 + THREAD_WORKBENCH_TABS.length) %
        THREAD_WORKBENCH_TABS.length;
    } else if (event.key === "Home") {
      target = 0;
    } else if (event.key === "End") {
      target = THREAD_WORKBENCH_TABS.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    const tab = THREAD_WORKBENCH_TABS[target];
    if (!tab) return;
    selectTab(tab);
    requestAnimationFrame(() => tabRefs.current[tab]?.focus());
  };

  return (
    <aside
      aria-label="Thread workbench"
      className={WORKBENCH_RAIL_CLASS}
      data-thread-workbench="rail"
      style={
        { "--thread-workbench-width": `${model.railWidth}px` } as CSSProperties
      }
    >
      <PanelResizeHandle
        bounds={{
          default: THREAD_WORKBENCH_DEFAULT_WIDTH,
          min: THREAD_WORKBENCH_MIN_WIDTH,
          max: THREAD_WORKBENCH_MAX_WIDTH,
        }}
        className={WORKBENCH_RESIZER_CLASS}
        direction="grow-left"
        label="Resize thread workbench"
        onResize={(railWidth) =>
          setModel((current) => ({
            ...current,
            railWidth: clampThreadWorkbenchWidth(railWidth),
          }))
        }
        value={model.railWidth}
      />

      <header className={WORKBENCH_HEADER_CLASS}>
        <div className={WORKBENCH_HEADING_CLASS}>
          <div className={WORKBENCH_LOCKUP_CLASS}>
            <span aria-hidden="true" className={WORKBENCH_MARK_CLASS}>
              <i />
              <span>WB</span>
            </span>
            <div>
              <span className={WORKBENCH_KICKER_CLASS}>Workbench {"//"}</span>
              <strong>{model.workspaceName}</strong>
              <small>Thread-bound operator surface</small>
            </div>
          </div>
          <button
            aria-label="Close thread workbench"
            className={WORKBENCH_ICON_BUTTON_CLASS}
            onClick={onRequestClose}
            title="Close workbench"
            type="button"
          >
            <UiIcon icon={X} size="sm" />
          </button>
        </div>
        <div
          className={WORKBENCH_CONTEXT_ROW_CLASS}
          data-thread-workbench="context"
        >
          <div className={WORKBENCH_CONTEXT_PRIMARY_CLASS}>
            <span className={WORKBENCH_REPO_MARK_CLASS} aria-hidden="true">
              <UiIcon icon={GitBranch} size="sm" />
            </span>
            <div className={WORKBENCH_CONTEXT_COPY_CLASS}>
              <strong>{branchHeadLabel(model.branch, model.head)}</strong>
              <small title={model.worktreePath || model.workspacePath}>
                {model.worktreePath
                  ? `Worktree · ${compactRailLabel(model.worktreePath)}`
                  : `Local · ${compactRailLabel(model.workspacePath)}`}
              </small>
            </div>
          </div>
          <div
            className={WORKBENCH_CONTEXT_META_CLASS}
            data-thread-workbench="status"
            aria-label="Workbench status"
            role="status"
          >
            <Badge
              tone={
                repositorySummary?.dirty
                  ? "warn"
                  : repositorySummary?.isRepository
                    ? "good"
                    : "neutral"
              }
            >
              {repositorySummary?.dirty
                ? `${asNumber(repositorySummary.changedFiles)} changed`
                : repositorySummary?.isRepository
                  ? "clean"
                  : "workspace"}
            </Badge>
            <span>
              <i aria-hidden="true" /> {model.lifecycle}
            </span>
          </div>
        </div>
      </header>

      <div
        aria-label="Thread workbench views"
        className={WORKBENCH_TABS_CLASS}
        role="tablist"
      >
        {THREAD_WORKBENCH_TABS.map((tab, index) => (
          <button
            aria-label={TAB_LABELS[tab]}
            aria-controls={`thread-workbench-${tab}-panel`}
            aria-selected={model.selectedTab === tab}
            id={`thread-workbench-${tab}-tab`}
            key={tab}
            className={`${WORKBENCH_TAB_CLASS} group ${
              model.selectedTab === tab ? WORKBENCH_TAB_SELECTED_CLASS : ""
            }`}
            onClick={() => selectTab(tab)}
            onKeyDown={(event) => navigateTabs(event, index)}
            ref={(node) => {
              tabRefs.current[tab] = node;
            }}
            role="tab"
            tabIndex={model.selectedTab === tab ? 0 : -1}
            title={TAB_LABELS[tab]}
            type="button"
          >
            <span className={WORKBENCH_TAB_MARK_CLASS} aria-hidden="true">
              <UiIcon icon={WORKBENCH_TAB_ICONS[tab]} size="xs" />
            </span>
            <small className="sr-only">{TAB_LABELS[tab]}</small>
            <i aria-hidden="true" className={WORKBENCH_TAB_SIGNAL_CLASS} />
          </button>
        ))}
      </div>

      <WorkbenchPanels
        controller={controller}
        onOpenFullView={onOpenFullView}
        workspacePath={workspacePath}
      />

      <footer className={WORKBENCH_FOOTER_CLASS}>
        <span aria-live="polite">
          {copiedLabel || `${model.environment} · ${model.lifecycle}`}
        </span>
        <button
          aria-label="Refresh current workbench view"
          className={WORKBENCH_ICON_BUTTON_CLASS}
          onClick={refreshCurrent}
          title="Refresh"
          type="button"
        >
          <UiIcon icon={RefreshCw} size="sm" />
        </button>
      </footer>
    </aside>
  );
}

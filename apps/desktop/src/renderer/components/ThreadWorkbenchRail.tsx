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
  branchHeadLabel,
  compactRailLabel,
  TAB_LABELS,
  TAB_MARKS,
  type ThreadWorkbenchFullView,
} from "../thread-workbench/models";
import { WorkbenchPanels } from "../thread-workbench/WorkbenchPanels";
import { useThreadWorkbenchRailController } from "../thread-workbench-controller";
import { PanelResizeHandle } from "./PanelResizeHandle";
import "../thread-workbench.css";

export type { ThreadWorkbenchFullView } from "../thread-workbench/models";

export interface ThreadWorkbenchRailProps {
  active: boolean;
  sessionId: string;
  workspacePath: string;
  onInsertContext: (text: string) => void;
  onOpenFullView: (view: ThreadWorkbenchFullView) => void;
  onRequestClose: () => void;
}

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
      className="thread-workbench"
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
        className="thread-workbench-resizer"
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

      <header className="thread-workbench-header">
        <div className="thread-workbench-heading">
          <div className="thread-workbench-lockup">
            <span aria-hidden="true" className="thread-workbench-mark">
              <i />
              <span>WB</span>
            </span>
            <div>
              <span className="thread-workbench-kicker">Workbench {"//"}</span>
              <strong>{model.workspaceName}</strong>
              <small>Thread-bound operator surface</small>
            </div>
          </div>
          <button
            aria-label="Close thread workbench"
            className="thread-workbench-icon-button"
            onClick={onRequestClose}
            title="Close workbench"
            type="button"
          >
            ×
          </button>
        </div>
        <div className="thread-workbench-repository">
          <span className="thread-workbench-repo-mark" aria-hidden="true">
            ⎇
          </span>
          <div>
            <strong>{branchHeadLabel(model.branch, model.head)}</strong>
            <small title={model.worktreePath || model.workspacePath}>
              {model.worktreePath
                ? `Worktree · ${compactRailLabel(model.worktreePath)}`
                : `Local · ${compactRailLabel(model.workspacePath)}`}
            </small>
          </div>
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
        </div>
        <div
          className="thread-workbench-status-strip"
          aria-label="Workbench status"
          role="status"
        >
          <span>
            <i aria-hidden="true" /> {model.lifecycle}
          </span>
          <span>{model.environment}</span>
          <span>{THREAD_WORKBENCH_TABS.length} modules</span>
        </div>
      </header>

      <div
        aria-label="Thread workbench views"
        className="thread-workbench-tabs"
        role="tablist"
      >
        {THREAD_WORKBENCH_TABS.map((tab, index) => (
          <button
            aria-controls={`thread-workbench-${tab}-panel`}
            aria-selected={model.selectedTab === tab}
            id={`thread-workbench-${tab}-tab`}
            key={tab}
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
            <span className="thread-workbench-tab-mark" aria-hidden="true">
              {TAB_MARKS[tab]}
            </span>
            <small>{TAB_LABELS[tab]}</small>
            <i aria-hidden="true" className="thread-workbench-tab-signal" />
          </button>
        ))}
      </div>

      <WorkbenchPanels
        controller={controller}
        onOpenFullView={onOpenFullView}
        workspacePath={workspacePath}
      />

      <footer className="thread-workbench-footer">
        <span aria-live="polite">
          {copiedLabel || `${model.environment} · ${model.lifecycle}`}
        </span>
        <button
          aria-label="Refresh current workbench view"
          className="thread-workbench-icon-button"
          onClick={refreshCurrent}
          title="Refresh"
          type="button"
        >
          ↻
        </button>
      </footer>
    </aside>
  );
}

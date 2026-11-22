import type { BotSummary } from "@doolittle/contracts/bots";
import { InspectorFrame, StateSurface } from "@doolittle/ui";
import { FolderOpen, X } from "lucide-react";
import { lazy, Suspense, useId } from "react";
import { BotActions } from "../bots/BotActions";
import { PanelResizeHandle } from "../components/PanelResizeHandle";
import { PanelTabs, panelTabId } from "../components/PanelTabs";
import { UiIcon } from "../components/UiIcon";
import {
  THREAD_WORKBENCH_TABS,
  type ThreadWorkbenchTab,
} from "../thread-workbench";
import {
  TAB_LABELS,
  type ThreadWorkbenchFullView,
} from "../thread-workbench/models";
import "../thread-workbench/workspace-inspector.css";

const ThreadWorkbenchRail = lazy(async () => {
  const module = await import("../components/ThreadWorkbenchRail");
  return { default: module.ThreadWorkbenchRail };
});

export type InspectorTab = "details" | ThreadWorkbenchTab;
const views = [
  { id: "details" as const, label: "Details" },
  ...THREAD_WORKBENCH_TABS.map((id) => ({ id, label: TAB_LABELS[id] })),
];

export interface CompanionInspectorProps {
  active: boolean;
  bot?: BotSummary;
  botId?: string;
  contextLabel: string;
  fullWidth?: boolean;
  width?: number;
  resize?: {
    bounds: { default: number; min: number; max: number };
    onResize: (value: number) => void;
    value: number;
  };
  messageCount: number;
  onClose: () => void;
  onInsertContext: (text: string) => void;
  onOpenFullView: (view: ThreadWorkbenchFullView) => void;
  onTabChange: (tab: InspectorTab) => void;
  sessionId: string;
  tab: InspectorTab;
  title: string;
  workspaceLabel: string;
  workspacePath: string;
}

export function CompanionInspector({
  active,
  bot,
  botId,
  contextLabel,
  fullWidth = false,
  width,
  resize,
  messageCount,
  onClose,
  onInsertContext,
  onOpenFullView,
  onTabChange,
  sessionId,
  tab,
  title,
  workspaceLabel,
  workspacePath,
}: CompanionInspectorProps) {
  const id = useId();
  return (
    <InspectorFrame
      id={`${id}-inspector`}
      title="Conversation inspector"
      className={`workspace-inspector workspace-inspector--chat relative flex h-full min-h-0 w-[var(--inspector-width,320px)] ${width !== undefined || resize ? "max-w-none" : "max-w-[40vw]"} flex-col overflow-hidden max-[720px]:w-full max-[720px]:max-w-none${fullWidth ? " !w-full !max-w-none" : " border-s border-[var(--border)] max-[720px]:border-s-0"}`}
      style={
        !fullWidth && (width !== undefined || resize)
          ? { width: width ?? resize?.value }
          : undefined
      }
    >
      {resize && !fullWidth ? (
        <PanelResizeHandle
          bounds={resize.bounds}
          className="inset-y-0 left-0 max-[720px]:hidden"
          controls={`${id}-inspector`}
          direction="grow-left"
          label="Resize conversation inspector"
          onResize={resize.onResize}
          value={resize.value}
        />
      ) : null}
      <header className="workspace-inspector-heading">
        <div className="workspace-inspector-label">
          <h2>Conversation context</h2>
          <small className="workspace-inspector-branch" title={workspaceLabel}>
            <UiIcon icon={FolderOpen} size="xs" />
            <span>{workspaceLabel}</span>
          </small>
        </div>
        <button
          aria-label="Close inspector"
          className="workspace-inspector-icon"
          onClick={onClose}
          title="Close inspector"
          type="button"
        >
          <UiIcon icon={X} size="sm" />
        </button>
      </header>
      <div className="workspace-inspector-tabs">
        <PanelTabs
          id={id}
          label="Conversation context views"
          items={views}
          selected={tab}
          onSelect={onTabChange}
        />
      </div>
      <section
        aria-labelledby={panelTabId(id, tab)}
        className={`workspace-inspector-body${tab === "details" ? " workspace-inspector-scroll" : ""}`}
        id={`${id}-panel`}
        role="tabpanel"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Details needs a reading focus target when it contains no interactive controls.
        tabIndex={0}
      >
        {tab === "details" ? (
          <>
            <dl className="workspace-inspector-details">
              <div>
                <dt>Conversation</dt>
                <dd>{title}</dd>
              </div>
              <div>
                <dt>Agent</dt>
                <dd>
                  {bot?.name ??
                    (botId
                      ? "Agent details unavailable"
                      : "No confirmed agent")}
                  {bot ? (
                    <span className="workspace-inspector-flag">
                      {bot.state}
                    </span>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt>Model</dt>
                <dd>
                  {bot
                    ? `${bot.model.provider} · ${bot.model.model}`
                    : "Runtime default"}
                </dd>
              </div>
              <div>
                <dt>Messages</dt>
                <dd>{messageCount}</dd>
              </div>
              <div>
                <dt>Context</dt>
                <dd>{contextLabel}</dd>
              </div>
              <div>
                <dt>Workspace</dt>
                <dd title={workspacePath || undefined}>{workspaceLabel}</dd>
              </div>
            </dl>
            {bot ? (
              <div className="workspace-inspector-agent-actions">
                <BotActions bot={bot} />
              </div>
            ) : null}
          </>
        ) : (
          <Suspense
            fallback={<StateSurface kind="loading" title={`Loading ${tab}…`} />}
          >
            <ThreadWorkbenchRail
              botId={botId}
              active={active && Boolean(botId)}
              tab={tab}
              onInsertContext={onInsertContext}
              onOpenFullView={onOpenFullView}
              sessionId={sessionId}
              workspacePath={workspacePath}
            />
          </Suspense>
        )}
      </section>
    </InspectorFrame>
  );
}

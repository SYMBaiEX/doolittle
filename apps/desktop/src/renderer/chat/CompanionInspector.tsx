import type { BotSummary } from "@doolittle/contracts/bots";
import { InspectorFrame, StateSurface } from "@doolittle/ui";
import { PanelRight, X } from "lucide-react";
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
  workspacePath: string;
}

export function CompanionInspector({
  active,
  bot,
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
  workspacePath,
}: CompanionInspectorProps) {
  const id = useId();
  return (
    <InspectorFrame
      id={`${id}-inspector`}
      title="Conversation inspector"
      className={`relative flex h-full min-h-0 w-[var(--inspector-width,320px)] ${width !== undefined || resize ? "max-w-none" : "max-w-[40vw]"} flex-col overflow-hidden border-l border-[var(--border)] bg-[var(--surface)] max-[720px]:w-full max-[720px]:max-w-none${fullWidth ? " !w-full !max-w-none" : ""}`}
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
      <header className="chat-inspector-heading">
        <span>
          <UiIcon icon={PanelRight} size="sm" />
          <h2>Conversation context</h2>
        </span>
        <button
          aria-label="Close inspector"
          className="chat-header-action"
          onClick={onClose}
          type="button"
        >
          <UiIcon icon={X} size="sm" />
        </button>
      </header>
      <div className="shrink-0 border-b border-[var(--border)]">
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
        className="min-h-0 flex-1 overflow-y-auto"
        id={`${id}-panel`}
        role="tabpanel"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Details needs a reading focus target when it contains no interactive controls.
        tabIndex={0}
      >
        {tab === "details" ? (
          <>
            <dl className="chat-inspector-details">
              <div>
                <dt>Conversation</dt>
                <dd>{title}</dd>
              </div>
              <div>
                <dt>Agent</dt>
                <dd>
                  {bot?.name ?? "Doolittle"}
                  {bot ? (
                    <span className="chat-inspector-agent-status">
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
                <dd>{workspacePath || "No workspace selected"}</dd>
              </div>
            </dl>
            {bot ? <BotActions bot={bot} /> : null}
          </>
        ) : (
          <Suspense
            fallback={<StateSurface kind="loading" title={`Loading ${tab}…`} />}
          >
            <ThreadWorkbenchRail
              botId={bot?.id}
              active={active}
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

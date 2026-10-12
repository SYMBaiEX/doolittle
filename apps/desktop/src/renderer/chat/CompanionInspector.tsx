import type { BotSummary } from "@doolittle/contracts/bots";
import { InspectorFrame, StateSurface } from "@doolittle/ui";
import { X } from "lucide-react";
import { lazy, Suspense, useId } from "react";
import { BotActions } from "../bots/BotActions";
import type { ThreadWorkbenchFullView } from "../components/ThreadWorkbenchRail";

const ThreadWorkbenchRail = lazy(async () => {
  const module = await import("../components/ThreadWorkbenchRail");
  return { default: module.ThreadWorkbenchRail };
});

export type InspectorTab = "details" | "library" | "computer";
const views: readonly InspectorTab[] = ["details", "library", "computer"];

export interface CompanionInspectorProps {
  active: boolean;
  bot?: BotSummary;
  contextLabel: string;
  fullWidth?: boolean;
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
      title="Conversation inspector"
      className={`flex h-full min-h-0 w-[var(--inspector-width,320px)] max-w-[40vw] flex-col overflow-hidden border-l border-[var(--border)] bg-[var(--surface)] max-[720px]:w-full max-[720px]:max-w-none${fullWidth ? " !w-full !max-w-none" : ""}`}
    >
      <header className="flex min-h-12 items-center justify-between border-b border-[var(--border)] px-3">
        <strong className="text-sm font-semibold">Inspector</strong>
        <button
          aria-label="Close inspector"
          className="grid size-10 place-items-center rounded-[var(--radius-md)] hover:bg-[var(--surface-hover)] max-[760px]:size-11"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden size={16} />
        </button>
      </header>
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-1">
        <label
          className="text-[length:var(--text-meta)] text-[var(--muted)]"
          htmlFor={`${id}-view`}
        >
          View
        </label>
        <select
          className="min-h-10 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2 text-[length:var(--text-control)] text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] max-[760px]:min-h-11"
          id={`${id}-view`}
          onChange={(event) => {
            const next = event.currentTarget.value;
            if (views.includes(next as InspectorTab))
              onTabChange(next as InspectorTab);
          }}
          value={tab}
        >
          {views.map((view) => (
            <option key={view} value={view}>
              {view[0]?.toUpperCase()}
              {view.slice(1)}
            </option>
          ))}
        </select>
      </div>
      <section
        aria-label={`${tab[0]?.toUpperCase()}${tab.slice(1)}`}
        className="min-h-0 flex-1 overflow-y-auto"
        id={`${id}-${tab}`}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Details needs a reading focus target when it contains no interactive controls.
        tabIndex={0}
      >
        {tab === "details" ? (
          <>
            <dl className="chat-inspector-details grid gap-4 p-4 text-sm [&_dd]:mt-1 [&_dd]:min-w-0 [&_dd]:break-words [&_dd]:text-[var(--text)] [&_dt]:text-[length:var(--text-meta)] [&_dt]:text-[var(--muted)]">
              <div>
                <dt>Conversation</dt>
                <dd>{title}</dd>
              </div>
              <div>
                <dt>Bot</dt>
                <dd>
                  {bot?.name ?? "Doolittle"}
                  {bot ? ` · ${bot.state}` : ""}
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
              group={tab}
              minimal
              onInsertContext={onInsertContext}
              onOpenFullView={onOpenFullView}
              onRequestClose={onClose}
              sessionId={sessionId}
              workspacePath={workspacePath}
            />
          </Suspense>
        )}
      </section>
    </InspectorFrame>
  );
}

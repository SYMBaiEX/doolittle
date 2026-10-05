import type { BotSummary } from "@doolittle/contracts/bots";
import { InspectorFrame, StateSurface } from "@doolittle/ui";
import { X } from "lucide-react";
import { lazy, Suspense, useId, useRef } from "react";
import { BotActions } from "../bots/BotActions";
import type { ThreadWorkbenchFullView } from "../components/ThreadWorkbenchRail";

const ThreadWorkbenchRail = lazy(async () => {
  const module = await import("../components/ThreadWorkbenchRail");
  return { default: module.ThreadWorkbenchRail };
});

export type InspectorTab = "details" | "library" | "computer";
const tabs: readonly InspectorTab[] = ["details", "library", "computer"];

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
  const tabRefs = useRef<Record<InspectorTab, HTMLButtonElement | null>>({
    details: null,
    library: null,
    computer: null,
  });
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
      <div
        aria-label="Inspector views"
        className="flex border-b border-[var(--border)] px-2"
        role="tablist"
      >
        {tabs.map((item, index) => (
          <button
            aria-controls={`${id}-${item}`}
            aria-selected={tab === item}
            className="min-h-10 flex-1 border-b-2 border-transparent px-2 text-[length:var(--text-control)] text-[var(--text-soft)] hover:text-[var(--text)] aria-selected:border-[var(--accent)] aria-selected:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] max-[760px]:min-h-11"
            id={`${id}-${item}-tab`}
            key={item}
            onClick={() => onTabChange(item)}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % tabs.length
                  : event.key === "ArrowLeft"
                    ? (index - 1 + tabs.length) % tabs.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? tabs.length - 1
                        : -1;
              if (next < 0) return;
              event.preventDefault();
              const target = tabs[next];
              if (target) {
                onTabChange(target);
                requestAnimationFrame(() => tabRefs.current[target]?.focus());
              }
            }}
            ref={(node) => {
              tabRefs.current[item] = node;
            }}
            role="tab"
            tabIndex={tab === item ? 0 : -1}
            type="button"
          >
            {item[0]?.toUpperCase()}
            {item.slice(1)}
          </button>
        ))}
      </div>
      <div
        aria-labelledby={`${id}-${tab}-tab`}
        className="min-h-0 flex-1 overflow-y-auto"
        id={`${id}-${tab}`}
        role="tabpanel"
      >
        {tab === "details" ? (
          <>
            <dl className="grid gap-3 p-4 text-sm [&_dd]:min-w-0 [&_dd]:break-words [&_dd]:text-[var(--text)] [&_dt]:text-xs [&_dt]:text-[var(--muted)]">
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
      </div>
    </InspectorFrame>
  );
}

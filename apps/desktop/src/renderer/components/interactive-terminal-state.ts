import type { InteractiveTerminalTabState } from "./interactive-terminal-store";

export const MAX_CHAT_TERMINAL_CONTEXT = 20_000;

export function terminalTabLabelId(tabId: string): string {
  return `interactive-terminal-${tabId}-label`;
}

export function boundedTerminalOutput(
  output: string,
  maxCharacters: number,
): string {
  return output.slice(-maxCharacters);
}

export function appendTerminalBytes(
  output: string,
  chunks: string,
  maxCharacters: number,
  truncatedBeforeCursor = false,
): string {
  const retentionNotice = "[Doolittle retained the newest terminal output.]";
  const marker =
    truncatedBeforeCursor && !output.includes(retentionNotice)
      ? "\n[Doolittle retained the newest terminal output.]"
      : "";
  return boundedTerminalOutput(`${output}${marker}${chunks}`, maxCharacters);
}

export function terminalChatContext(output: string): string {
  return [
    "Use this interactive terminal output as context.",
    "<terminal_context>",
    output.slice(-MAX_CHAT_TERMINAL_CONTEXT),
    "</terminal_context>",
  ].join("\n");
}

export interface CloseTerminalTabStateInput {
  tabs: InteractiveTerminalTabState[];
  activeTabId: string;
  tabId: string;
  fallbackTab: InteractiveTerminalTabState;
}

export interface CloseTerminalTabStateResult {
  tabs: InteractiveTerminalTabState[];
  activeTabId: string;
  closedTab: InteractiveTerminalTabState | undefined;
}

/**
 * Reconciles against the current tab collection so an asynchronous terminal
 * close never discards a tab created while its runtime request was pending.
 */
export function closeTerminalTabState({
  tabs,
  activeTabId,
  tabId,
  fallbackTab,
}: CloseTerminalTabStateInput): CloseTerminalTabStateResult {
  const targetIndex = tabs.findIndex((tab) => tab.id === tabId);
  const closedTab = targetIndex >= 0 ? tabs[targetIndex] : undefined;
  if (!closedTab) return { tabs, activeTabId, closedTab };

  const nextTabs = tabs.filter((tab) => tab.id !== tabId);
  const normalizedTabs = nextTabs.length ? nextTabs : [fallbackTab];
  const nextActiveTabId =
    activeTabId === tabId
      ? ((normalizedTabs[targetIndex] ?? normalizedTabs.at(-1))?.id ??
        fallbackTab.id)
      : normalizedTabs.some((tab) => tab.id === activeTabId)
        ? activeTabId
        : (normalizedTabs[0]?.id ?? fallbackTab.id);

  return {
    tabs: normalizedTabs,
    activeTabId: nextActiveTabId,
    closedTab,
  };
}

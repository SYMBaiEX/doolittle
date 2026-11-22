export const WORKBENCH_PANEL_CLASS =
  "thread-workbench-panel grid min-h-0 min-w-0 flex-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden";

const WORKBENCH_PANEL_BODY_BASE =
  "thread-workbench-panel-body min-h-0 min-w-0 [&>.notice]:items-start [&>.notice]:flex-col [&>.notice]:[overflow-wrap:anywhere] [&>.notice_span]:shrink-0 [&>.notice_.text-button]:self-end";

export const WORKBENCH_FILES_BODY_CLASS = `${WORKBENCH_PANEL_BODY_BASE} thread-workbench-panel-body--files flex flex-1 flex-col overflow-auto`;

export const WORKBENCH_SCROLL_BODY_CLASS = `${WORKBENCH_PANEL_BODY_BASE} flex flex-1 flex-col gap-2.5 overflow-auto overscroll-contain`;

export const WORKBENCH_FILE_SPLIT_CLASS =
  "thread-workbench-file-workspace grid min-h-36 min-w-0 flex-1 grid-rows-[minmax(72px,0.9fr)_minmax(95px,1.1fr)] overflow-hidden";

export const WORKBENCH_TREE_CLASS =
  "thread-workbench-tree min-h-0 min-w-0 overflow-hidden [&_.workspace-file-tree-shell]:h-full [&_.workspace-file-tree-shell]:min-h-0";

export const WORKBENCH_EMPTY_CLASS =
  "thread-workbench-empty workspace-inspector-empty";

export const WORKBENCH_CODE_PREVIEW_CLASS =
  "thread-workbench-code-preview relative grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-[var(--bg)]";

export const WORKBENCH_MONACO_CLASS =
  "thread-workbench-monaco relative block min-h-0 min-w-0 overflow-hidden border-0 p-0 [&_.doolittle-code-editor]:rounded-none";

export const WORKBENCH_FILE_EMPTY_CLASS =
  "thread-workbench-file-empty row-span-full flex min-h-0 flex-col items-center justify-center gap-1.5 p-5 text-center text-[var(--muted)] [&_strong]:text-[length:var(--text-control)] [&_strong]:text-[var(--text)] [&_p]:m-0 [&_p]:max-w-57.5 [&_p]:text-[length:var(--text-meta)] [&_p]:leading-[1.45]";

export const WORKBENCH_FILE_EMPTY_ICON_CLASS =
  "thread-workbench-file-empty-icon font-[var(--font-mono)] text-[length:var(--text-control)] text-[var(--muted)]";

export const WORKBENCH_CHECKPOINTS_BODY_CLASS =
  "thread-workbench-checkpoints-body grid justify-items-start gap-2 px-2 pt-1 pb-3";

export const WORKBENCH_CHECKPOINT_LIST_CLASS =
  "thread-workbench-checkpoint-list grid w-full gap-2 [&>div]:flex [&>div]:items-center [&>div]:justify-between [&>div]:gap-2";

export const WORKBENCH_CHECKPOINT_DETAILS_CLASS =
  "thread-workbench-checkpoint-details workspace-inspector-label";

export const WORKBENCH_LIST_CLASS =
  "thread-workbench-list grid min-h-0 content-start overflow-auto overscroll-contain [scrollbar-gutter:stable]";

export const WORKBENCH_LIST_BUTTON_CLASS = "thread-workbench-list-button";

export const WORKBENCH_PLAN_LIST_CLASS =
  "thread-workbench-plan-list grid min-h-0 min-w-0 flex-1 content-start overflow-auto overscroll-contain";

export const WORKBENCH_PLAN_CARD_CLASS = "thread-workbench-plan-card";

export const WORKBENCH_BRIEF_CLASS =
  "thread-workbench-brief workspace-inspector-groups";

export const WORKBENCH_BRIEF_STACK_CLASS =
  "thread-workbench-brief-stack grid grid-cols-1 gap-2";

export const WORKBENCH_BRIEF_LIST_CLASS =
  "thread-workbench-brief-list grid gap-2";

export const WORKBENCH_BRIEF_EMPTY_CLASS =
  "thread-workbench-brief-empty m-0 text-[length:var(--text-meta)] leading-[1.45] text-[var(--muted)]";

export const WORKBENCH_BRIEF_STAT_CLASS =
  "thread-workbench-brief-stat py-1.75 [&_span]:block [&_strong]:my-1 [&_strong]:block [&_small]:block [&_small]:text-[length:var(--text-meta)] [&_small]:text-[var(--muted)]";

export const WORKBENCH_QUICK_NAV_CLASS = "thread-workbench-quick-nav";

export const WORKBENCH_SETTINGS_CLASS =
  "thread-workbench-settings workspace-inspector-groups";

export const WORKBENCH_SETTINGS_GRID_CLASS =
  "thread-workbench-settings-grid grid min-h-0 gap-1.5";

export const WORKBENCH_SETTINGS_ITEM_CLASS = "thread-workbench-settings-item";

export const WORKBENCH_SETTINGS_NAV_CLASS = "thread-workbench-settings-nav";

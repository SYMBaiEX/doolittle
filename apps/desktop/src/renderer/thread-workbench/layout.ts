export const WORKBENCH_PANEL_CLASS =
  "thread-workbench-panel grid min-h-0 min-w-0 flex-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden";

export const WORKBENCH_TEXT_BUTTON_CLASS =
  "thread-workbench-text-button cursor-pointer border-0 bg-transparent p-1.25 text-[length:var(--text-meta)] leading-none font-semibold text-[var(--accent-text)] hover:underline focus-visible:underline disabled:cursor-default disabled:opacity-42 disabled:no-underline";

const WORKBENCH_PANEL_BODY_BASE =
  "thread-workbench-panel-body min-h-0 min-w-0 [&>.notice]:items-start [&>.notice]:flex-col [&>.notice]:[overflow-wrap:anywhere] [&>.notice_span]:shrink-0 [&>.notice_.text-button]:self-end";

export const WORKBENCH_FILES_BODY_CLASS = `${WORKBENCH_PANEL_BODY_BASE} thread-workbench-panel-body--files flex flex-1 flex-col overflow-auto`;

export const WORKBENCH_SCROLL_BODY_CLASS = `${WORKBENCH_PANEL_BODY_BASE} flex flex-1 flex-col gap-2.5 overflow-auto overscroll-contain`;

export const WORKBENCH_FILE_SPLIT_CLASS =
  "thread-workbench-file-workspace grid min-h-36 min-w-0 flex-1 grid-rows-[minmax(72px,0.9fr)_minmax(95px,1.1fr)] overflow-hidden";

export const WORKBENCH_TREE_CLASS =
  "thread-workbench-tree min-h-0 min-w-0 overflow-hidden border-b border-[var(--border)] [&_.workspace-file-tree-shell]:h-full [&_.workspace-file-tree-shell]:min-h-0";

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
  "thread-workbench-checkpoints-body grid gap-1.75 border-[color-mix(in_srgb,currentColor_10%,transparent)] border-t px-2.25 pt-2 pb-2.25";

export const WORKBENCH_CHECKPOINT_LIST_CLASS =
  "thread-workbench-checkpoint-list grid gap-1.5 [&>div]:flex [&>div]:items-center [&>div]:justify-between [&>div]:gap-1.75 [&_button]:cursor-pointer [&_button]:rounded-md [&_button]:border [&_button]:border-[color-mix(in_srgb,currentColor_16%,transparent)] [&_button]:bg-transparent [&_button]:px-1.75 [&_button]:py-1.25 [&_button]:text-[length:var(--text-meta)] [&_button]:leading-none [&_button]:font-semibold [&_button]:text-[var(--accent-text)]";

export const WORKBENCH_CHECKPOINT_DETAILS_CLASS =
  "thread-workbench-checkpoint-details flex flex-col gap-1.75";

export const WORKBENCH_LIST_CLASS =
  "thread-workbench-list grid min-h-0 content-start overflow-auto overscroll-contain [scrollbar-gutter:stable]";

export const WORKBENCH_LIST_BUTTON_CLASS =
  "grid min-h-10 cursor-pointer grid-cols-[14px_minmax(0,1fr)_auto] items-center gap-1.75 rounded-md border-0 bg-transparent px-1.75 py-1 text-left font-[var(--font-mono)] text-[length:var(--text-meta)] leading-[1.35] text-[var(--muted)] hover:bg-[color-mix(in_srgb,currentColor_6%,transparent)] hover:text-[var(--text)] focus-visible:bg-[color-mix(in_srgb,currentColor_6%,transparent)] focus-visible:text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-[var(--focus-ring)] disabled:cursor-default disabled:opacity-66 [&>span:nth-child(2)]:truncate [&_small]:text-[length:var(--text-meta)] [&_small]:text-[var(--muted)]";

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

export const WORKBENCH_QUICK_NAV_CLASS =
  "thread-workbench-quick-nav grid gap-1.75 [&_button]:grid [&_button]:min-h-10 [&_button]:w-full [&_button]:items-start [&_button]:justify-items-start [&_button]:gap-0.5 [&_button]:min-h-10 [&_button]:rounded-none [&_button]:border-0 [&_button]:border-b [&_button]:border-[var(--border-subtle)] [&_button]:bg-transparent [&_button]:px-2.5 [&_button]:py-2 [&_button]:text-left [&_button]:text-[var(--text)] [&_button:hover]:border-[color-mix(in_srgb,currentColor_30%,transparent)] [&_button:hover]:bg-[color-mix(in_srgb,currentColor_8%,transparent)] [&_button:focus-visible]:border-[color-mix(in_srgb,currentColor_30%,transparent)] [&_button:focus-visible]:bg-[color-mix(in_srgb,currentColor_8%,transparent)] [&_button:focus-visible]:outline [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-[-2px] [&_button:focus-visible]:outline-[var(--focus-ring)]";

export const WORKBENCH_SETTINGS_CLASS =
  "thread-workbench-settings workspace-inspector-groups";

export const WORKBENCH_SETTINGS_GRID_CLASS =
  "thread-workbench-settings-grid grid min-h-0 gap-1.5";

export const WORKBENCH_SETTINGS_ITEM_CLASS = "thread-workbench-settings-item";

export const WORKBENCH_SETTINGS_NAV_CLASS = "thread-workbench-settings-nav";

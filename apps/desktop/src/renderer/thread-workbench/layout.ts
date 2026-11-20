export const WORKBENCH_PANEL_CLASS =
  "thread-workbench-panel grid min-h-0 min-w-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-0.75 overflow-hidden p-1 focus:outline-none";

export const WORKBENCH_PANEL_HEADING_CLASS =
  "thread-workbench-panel-heading flex min-h-6.5 shrink-0 items-center justify-between gap-1.75 border-[color-mix(in_srgb,var(--border)_72%,transparent)] border-b px-0.75 py-0.75 [&>div]:flex [&>div]:min-w-0 [&>div]:items-baseline [&>div]:gap-1.5 [&_small]:font-[var(--font-mono)] [&_small]:text-[length:var(--text-meta)] [&_small]:leading-[1.2] [&_small]:text-[var(--muted)]";

export const WORKBENCH_PANEL_TITLE_CLASS =
  "thread-workbench-panel-title text-[length:var(--text-control)] font-bold";

export const WORKBENCH_TEXT_BUTTON_CLASS =
  "thread-workbench-text-button cursor-pointer border-0 bg-transparent p-1.25 text-[length:var(--text-meta)] leading-none font-semibold text-[var(--accent-text)] hover:underline focus-visible:underline disabled:cursor-default disabled:opacity-42 disabled:no-underline";

const WORKBENCH_PANEL_BODY_BASE =
  "thread-workbench-panel-body min-h-0 min-w-0 [&>.notice]:items-start [&>.notice]:flex-col [&>.notice]:[overflow-wrap:anywhere] [&>.notice_span]:shrink-0 [&>.notice_.text-button]:self-end";

export const WORKBENCH_FILES_BODY_CLASS = `${WORKBENCH_PANEL_BODY_BASE} thread-workbench-panel-body--files flex flex-1 flex-col gap-2.5 overflow-hidden`;

export const WORKBENCH_TERMINAL_BODY_CLASS = `${WORKBENCH_PANEL_BODY_BASE} thread-workbench-panel-body--terminal flex flex-1 flex-col gap-2 overflow-hidden`;

export const WORKBENCH_CHANGES_BODY_CLASS = `${WORKBENCH_PANEL_BODY_BASE} thread-workbench-panel-body--changes grid grid-rows-[minmax(140px,0.96fr)_minmax(180px,1.04fr)] gap-2.5 overflow-hidden`;

export const WORKBENCH_SCROLL_BODY_CLASS = `${WORKBENCH_PANEL_BODY_BASE} flex flex-1 flex-col gap-2.5 overflow-auto overscroll-contain`;

export const WORKBENCH_PANE_STACK_CLASS =
  "thread-workbench-pane-stack grid min-h-0 min-w-0 gap-2.5 overflow-auto overscroll-contain [scrollbar-gutter:stable] [&>.git-control-panel]:min-h-0 [&>.git-control-panel]:overflow-hidden [&>.git-control-panel_.git-control-scroll]:max-h-full [&>.git-control-panel_.git-control-scroll]:min-h-0 [&>.git-control-panel_.git-control-scroll]:overscroll-contain";

export const WORKBENCH_SPLIT_CLASS =
  "thread-workbench-split grid min-h-35 min-w-0 flex-1 grid-rows-[minmax(112px,0.8fr)_minmax(150px,1.2fr)] gap-2 overflow-hidden";

export const WORKBENCH_FILE_SPLIT_CLASS = `${WORKBENCH_SPLIT_CLASS} thread-workbench-file-workspace grid-rows-[minmax(132px,0.82fr)_minmax(190px,1.35fr)]`;

export const WORKBENCH_TREE_CLASS =
  "thread-workbench-tree min-h-0 min-w-0 overflow-hidden rounded-lg border border-[color-mix(in_srgb,currentColor_8%,transparent)] bg-[color-mix(in_srgb,var(--surface-soft)_82%,var(--bg))] [&_.workspace-file-tree-shell]:h-full [&_.workspace-file-tree-shell]:min-h-0 [&_.workspace-file-tree-header]:min-h-8.5 [&_.workspace-file-tree-header]:bg-[color-mix(in_srgb,currentColor_3%,transparent)] [&_.workspace-file-tree-header]:py-1 [&_.workspace-file-tree-header_strong]:text-[length:var(--text-meta)] [&_.workspace-file-tree-header_span]:text-[length:var(--text-meta)] [&_.workspace-tree-extension]:text-[length:var(--text-meta)] [&_.workspace-file-tree]:p-1 [&_.workspace-file-tree_[role=treeitem]]:min-h-10 [&_.workspace-file-tree_[role=treeitem]]:py-0.5 [&_.workspace-tree-name]:text-[length:var(--text-control)]";

export const WORKBENCH_EMPTY_CLASS =
  "thread-workbench-empty m-auto px-3 py-6.25 text-center text-[length:var(--text-control)] leading-[1.5] text-[var(--muted)]";

export const WORKBENCH_PREVIEW_CLASS =
  "thread-workbench-preview grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border border-[color-mix(in_srgb,currentColor_8%,transparent)] bg-[color-mix(in_srgb,var(--surface)_88%,var(--bg))] [&>div:first-child:not(.thread-workbench-file-empty)]:flex [&>div:first-child:not(.thread-workbench-file-empty)]:min-h-8 [&>div:first-child:not(.thread-workbench-file-empty)]:items-center [&>div:first-child:not(.thread-workbench-file-empty)]:justify-between [&>div:first-child:not(.thread-workbench-file-empty)]:gap-2 [&>div:first-child:not(.thread-workbench-file-empty)]:border-[color-mix(in_srgb,currentColor_8%,transparent)] [&>div:first-child:not(.thread-workbench-file-empty)]:border-b [&>div:first-child:not(.thread-workbench-file-empty)]:py-1 [&>div:first-child:not(.thread-workbench-file-empty)]:pr-1.75 [&>div:first-child:not(.thread-workbench-file-empty)]:pl-2.5 [&_button]:cursor-pointer [&_button]:border-0 [&_button]:bg-transparent [&_button]:p-1.25 [&_button]:text-[length:var(--text-meta)] [&_button]:leading-none [&_button]:font-semibold [&_button]:text-[var(--accent-text)] [&_button:hover]:underline [&_button:focus-visible]:underline [&_button:disabled]:cursor-default [&_button:disabled]:opacity-42 [&_button:disabled]:no-underline [&_code]:truncate [&_code]:font-[var(--font-mono)] [&_code]:text-[length:var(--text-meta)] [&_code]:leading-[1.2] [&_code]:text-[var(--muted)] [&_pre]:m-0 [&_pre]:overflow-auto [&_pre]:overscroll-contain [&_pre]:p-2.5 [&_pre]:font-[var(--font-mono)] [&_pre]:text-[length:var(--text-meta)] [&_pre]:leading-[1.45] [&_pre]:text-[var(--muted)] [&_pre]:[scrollbar-gutter:stable] [&_pre]:[tab-size:2] [&_pre]:whitespace-pre-wrap";

export const WORKBENCH_CODE_PREVIEW_CLASS = `${WORKBENCH_PREVIEW_CLASS} thread-workbench-code-preview relative [&>div:first-child:not(.thread-workbench-file-empty)]:grid [&>div:first-child:not(.thread-workbench-file-empty)]:grid-cols-[minmax(0,1fr)_auto_auto] [&>div:first-child:not(.thread-workbench-file-empty)>span]:font-[var(--font-mono)] [&>div:first-child:not(.thread-workbench-file-empty)>span]:text-[length:var(--text-meta)] [&>div:first-child:not(.thread-workbench-file-empty)>span]:leading-none [&>div:first-child:not(.thread-workbench-file-empty)>span]:font-bold [&>div:first-child:not(.thread-workbench-file-empty)>span]:tracking-[0.06em] [&>div:first-child:not(.thread-workbench-file-empty)>span]:text-[var(--accent-text)] [&>div:first-child:not(.thread-workbench-file-empty)>span]:uppercase [&>div:first-child:not(.thread-workbench-file-empty)>div]:flex [&>div:first-child:not(.thread-workbench-file-empty)>div]:shrink-0 [&>div:first-child:not(.thread-workbench-file-empty)>div]:gap-0.5`;

export const WORKBENCH_DIFF_PREVIEW_CLASS = `${WORKBENCH_PREVIEW_CLASS} diff [&_pre]:text-[var(--canvas-text-soft)] [&_pre]:whitespace-pre`;

export const WORKBENCH_TERMINAL_PREVIEW_CLASS = `${WORKBENCH_PREVIEW_CLASS} terminal [&_pre]:text-[var(--canvas-text)]`;

export const WORKBENCH_MONACO_CLASS =
  "thread-workbench-monaco relative block min-h-0 min-w-0 overflow-hidden border-0 p-0 [&_.doolittle-code-editor]:rounded-none";

export const WORKBENCH_FILE_EMPTY_CLASS =
  "thread-workbench-file-empty row-span-full flex min-h-0 flex-col items-center justify-center gap-1.5 p-5 text-center text-[var(--muted)] [&_strong]:text-[length:var(--text-control)] [&_strong]:text-[var(--text)] [&_p]:m-0 [&_p]:max-w-57.5 [&_p]:text-[length:var(--text-meta)] [&_p]:leading-[1.45]";

export const WORKBENCH_FILE_EMPTY_ICON_CLASS =
  "thread-workbench-file-empty-icon grid size-8.5 place-items-center rounded-lg border border-[color-mix(in_srgb,var(--accent)_28%,transparent)] bg-[var(--thread-workbench-accent-soft)] font-[var(--font-mono)] text-[length:var(--text-control)] leading-none font-bold text-[var(--accent-text)]";

export const WORKBENCH_CHECKPOINTS_CLASS =
  "thread-workbench-checkpoints mb-0 shrink-0 overflow-hidden rounded-[9px] border border-[color-mix(in_srgb,currentColor_10%,transparent)] bg-[color-mix(in_srgb,currentColor_3%,transparent)] [&>summary]:flex [&>summary]:min-h-8.75 [&>summary]:cursor-pointer [&>summary]:list-none [&>summary]:items-center [&>summary]:justify-between [&>summary]:gap-2 [&>summary]:px-2.25 [&>summary]:py-1.75 [&>summary::-webkit-details-marker]:hidden [&>summary>span]:flex [&>summary>span]:flex-col [&>summary>span]:gap-1.75 [&_small]:m-0 [&_small]:text-[length:var(--text-meta)] [&_small]:text-[var(--muted)] [&_p]:m-0 [&_p]:text-[length:var(--text-meta)] [&_p]:text-[var(--muted)]";

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

export const WORKBENCH_LIST_BUTTON_SELECTED_CLASS =
  "selected font-semibold text-[var(--text)]";

export function workbenchChangeTone(tone: string): string {
  if (tone === "untracked") return "untracked text-[var(--theme-cyan)]";
  if (tone === "staged") return "staged text-[var(--good)]";
  return "modified text-[var(--warn)]";
}

export const WORKBENCH_TERMINAL_CLASS =
  "thread-workbench-terminal grid min-h-35 min-w-0 flex-1 grid-rows-[minmax(104px,0.72fr)_minmax(160px,1.28fr)] gap-2 overflow-hidden";

export const WORKBENCH_COMMAND_LIST_CLASS =
  "thread-workbench-command-list grid min-h-0 content-start overflow-auto overscroll-contain [scrollbar-gutter:stable]";

export const WORKBENCH_COMMAND_BUTTON_CLASS =
  "grid min-h-6 cursor-pointer grid-cols-1 items-center gap-1.25 rounded-none border-0 border-[color-mix(in_srgb,currentColor_6%,transparent)] border-b bg-transparent px-1.5 py-1.5 text-left font-[var(--font-mono)] text-[length:var(--text-meta)] leading-[1.35] text-[var(--muted)] hover:bg-[color-mix(in_srgb,currentColor_6%,transparent)] hover:text-[var(--text)] focus-visible:bg-[color-mix(in_srgb,currentColor_6%,transparent)] focus-visible:text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-[var(--focus-ring)] [&>span]:truncate [&_small]:text-[length:var(--text-meta)] [&_small]:text-[var(--muted)]";

export const WORKBENCH_PLAN_LIST_CLASS =
  "thread-workbench-plan-list grid min-h-0 min-w-0 flex-1 gap-1.75 overflow-auto overscroll-contain [scrollbar-gutter:stable]";

export const WORKBENCH_PLAN_CARD_CLASS =
  "thread-workbench-plan-card rounded-lg border border-[color-mix(in_srgb,currentColor_7%,transparent)] bg-[color-mix(in_srgb,currentColor_3%,transparent)] p-2.5 [&>div]:flex [&>div]:items-center [&>div]:justify-between [&>div]:gap-2 [&_strong]:text-[length:var(--text-control)] [&_p]:my-1.75 [&_p]:text-[length:var(--text-meta)] [&_p]:leading-[1.5] [&_p]:text-[var(--muted)] [&>small]:font-[var(--font-mono)] [&>small]:text-[length:var(--text-meta)] [&>small]:leading-[1.3] [&>small]:text-[var(--muted)]";

export const WORKBENCH_BRIEF_CLASS =
  "thread-workbench-brief grid min-h-0 min-w-0 flex-1 grid-cols-1 gap-2.5 overflow-auto overscroll-contain [scrollbar-gutter:stable] [&>section]:rounded-[10px] [&>section]:border [&>section]:border-[color-mix(in_srgb,currentColor_8%,transparent)] [&>section]:bg-[color-mix(in_srgb,currentColor_3%,transparent)] [&>section]:p-2.5 [&>section>h3]:mt-0 [&>section>h3]:mb-2 [&>section>h3]:text-[length:var(--text-meta)] [&>section>h3]:font-semibold [&>section>h3]:tracking-[0.03em] [&>section>h3]:uppercase [&_article]:mb-1.75 [&_article>div]:mb-1.75 [&_article>div]:flex [&_article>div]:items-baseline [&_article>div]:justify-between [&_article>div]:gap-2 [&_article>div_span]:text-[length:var(--text-meta)] [&_article>div_span]:text-[var(--muted)] [&_article>div_strong]:text-right [&_article>div_strong]:text-[length:var(--text-control)] [&_article>p]:mt-0 [&_article>p]:mb-1.75 [&_article>p]:text-[length:var(--text-meta)] [&_article>p]:leading-[1.45] [&_article>p]:text-[var(--muted)] [&_article>button]:cursor-pointer [&_article>button]:rounded-md [&_article>button]:border [&_article>button]:border-[color-mix(in_srgb,var(--accent)_34%,transparent)] [&_article>button]:bg-[var(--thread-workbench-accent-soft)] [&_article>button]:px-2.25 [&_article>button]:py-1.75 [&_article>button]:font-[var(--font-mono)] [&_article>button]:text-[length:var(--text-meta)] [&_article>button]:leading-none [&_article>button]:font-[680] [&_article>button]:text-[var(--accent-text)] [&_article>button:hover]:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] [&_article>button:focus-visible]:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] [&_article>button:focus-visible]:outline-none";

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
  "thread-workbench-settings grid min-h-0 min-w-0 flex-1 gap-2 overflow-auto overscroll-contain [scrollbar-gutter:stable] [&>section]:rounded-[10px] [&>section]:border [&>section]:border-[color-mix(in_srgb,currentColor_8%,transparent)] [&>section]:bg-[color-mix(in_srgb,currentColor_3%,transparent)] [&>section]:p-2.5 [&_h3]:mt-0 [&_h3]:mb-2 [&_h3]:text-[length:var(--text-meta)] [&_h3]:font-semibold [&_h3]:tracking-[0.03em] [&_h3]:uppercase [&_article]:mb-1.5 [&_article_p]:mb-1.5 [&_article_strong]:block [&_article_strong]:text-[length:var(--text-meta)] [&_article_span]:text-[length:var(--text-meta)] [&_article_span]:text-[var(--muted)] [&_article_small]:text-[length:var(--text-meta)] [&_article_small]:text-[var(--muted)]";

export const WORKBENCH_SETTINGS_GRID_CLASS =
  "thread-workbench-settings-grid grid min-h-0 gap-1.5";

export const WORKBENCH_SETTINGS_ITEM_CLASS =
  "thread-workbench-settings-item flex items-center justify-between gap-2.5 border-[color-mix(in_srgb,currentColor_12%,transparent)] border-t pt-1.5 first:border-t-0 first:pt-0";

export const WORKBENCH_SETTINGS_NAV_CLASS =
  "thread-workbench-settings-nav rounded-[10px] border border-[color-mix(in_srgb,currentColor_8%,transparent)] bg-[color-mix(in_srgb,currentColor_3%,transparent)] p-2.5 [&>summary]:min-h-8.5 [&>summary]:cursor-pointer [&>summary]:list-none [&>summary]:p-0 [&>summary]:text-[length:var(--text-meta)] [&>summary]:font-semibold [&>summary]:text-[var(--accent-text)] [&>summary::-webkit-details-marker]:hidden [&>div]:grid [&>div]:gap-1.75 [&>div]:border-[color-mix(in_srgb,currentColor_10%,transparent)] [&>div]:border-t [&>div]:pt-2 [&_button]:grid [&_button]:min-h-10 [&_button]:w-full [&_button]:items-start [&_button]:justify-items-start [&_button]:gap-0.5 [&_button]:min-h-10 [&_button]:rounded-none [&_button]:border-0 [&_button]:border-b [&_button]:border-[var(--border-subtle)] [&_button]:bg-transparent [&_button]:px-2.5 [&_button]:py-2 [&_button]:text-left [&_button]:text-current [&_button:hover]:border-[color-mix(in_srgb,currentColor_30%,transparent)] [&_button:hover]:bg-[color-mix(in_srgb,currentColor_8%,transparent)] [&_button:focus-visible]:border-[color-mix(in_srgb,currentColor_30%,transparent)] [&_button:focus-visible]:bg-[color-mix(in_srgb,currentColor_8%,transparent)] [&_button:focus-visible]:outline [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-[-2px] [&_button:focus-visible]:outline-[var(--focus-ring)] [&_button_strong]:text-[var(--text)]";

export const WORKBENCH_PREVIEW_STATUS_CLASS =
  "thread-workbench-preview-status flex min-h-0 min-w-0 flex-1 flex-col items-center overflow-auto overscroll-contain px-4 pt-7 pb-4 text-center [scrollbar-gutter:stable] [&>strong]:mt-2.5 [&>strong]:text-[13px] [&_dl]:m-0 [&_dl]:grid [&_dl]:w-full [&_dl]:gap-0.5 [&_dl>div]:grid [&_dl>div]:grid-cols-[1fr_1.5fr] [&_dl>div]:py-1 [&_dl>div]:text-left [&_dl>div]:font-[var(--font-mono)] [&_dl>div]:text-[length:var(--text-meta)] [&_dl>div]:leading-[1.4] [&_dt]:text-[var(--muted)] [&_dd]:m-0 [&_dd]:truncate";

export const WORKBENCH_PREVIEW_ORBIT_CLASS =
  "thread-workbench-preview-orbit relative mb-4.25 inline-flex size-15 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[var(--thread-workbench-accent-soft)] [&>i]:absolute [&>i]:inset-[-7px] [&>i]:animate-spin [&>i]:rounded-full [&>i]:border [&>i]:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] [&>i]:duration-[4000ms] motion-reduce:[&>i]:animate-none [&>i]:after:absolute [&>i]:after:top-[7px] [&>i]:after:left-[7px] [&>i]:after:size-1.25 [&>i]:after:rounded-full [&>i]:after:bg-[var(--accent)] [&>i]:after:content-['']";

export const WORKBENCH_ORBIT_MARK_CLASS =
  "thread-workbench-orbit-mark text-[var(--accent-text)]";

export const WORKBENCH_PREVIEW_COPY_CLASS =
  "thread-workbench-preview-copy mt-1.75 mb-4 text-[length:var(--text-meta)] leading-[1.55] text-[var(--muted)]";

export const WORKBENCH_RAIL_CLASS =
  "thread-workbench relative grid h-full max-h-full min-h-0 w-[var(--thread-workbench-width)] min-w-[min(var(--thread-workbench-width),48vw)] max-w-[min(var(--thread-workbench-width),48vw)] flex-[0_0_var(--thread-workbench-width)] grid-rows-[auto_auto_minmax(0,1fr)_auto] overflow-hidden border-[color-mix(in_srgb,var(--border)_82%,transparent)] border-l bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-raised)_48%,transparent),transparent_110px),color-mix(in_srgb,var(--surface)_98%,var(--bg))] text-[var(--text)] shadow-[-16px_0_42px_color-mix(in_srgb,var(--shadow)_35%,transparent)] [--thread-workbench-accent:var(--accent)] [--thread-workbench-accent-soft:color-mix(in_srgb,var(--accent)_14%,transparent)] [&>*]:min-w-0 [&_.loading-block]:m-0 [&_.loading-block]:rounded-[9px] [&_.loading-block]:px-2.75 [&_.loading-block]:py-2.5 [&_.loading-block_span]:[overflow-wrap:anywhere] [&_.empty-block]:m-0 [&_.empty-block]:min-h-24 [&_.empty-block]:rounded-[9px] [&_.empty-block]:px-2.75 [&_.empty-block]:py-2.5 [&_.empty-block_span]:[overflow-wrap:anywhere] [&_.notice]:m-0 [&_.notice]:rounded-[9px] [&_.notice]:px-2.75 [&_.notice]:py-2.5 [&_.notice_span]:[overflow-wrap:anywhere] [&_.notice_p]:[overflow-wrap:anywhere] max-[1180px]:min-w-[min(var(--thread-workbench-width),44vw)] max-[1180px]:max-w-[min(var(--thread-workbench-width),44vw)] max-[960px]:min-w-[min(var(--thread-workbench-width),40vw)] max-[960px]:max-w-[min(var(--thread-workbench-width),40vw)] max-[720px]:w-full max-[720px]:min-w-0 max-[720px]:max-w-none max-[720px]:flex-1 max-[720px]:shadow-none";

export const WORKBENCH_RESIZER_CLASS =
  "thread-workbench-resizer top-0 bottom-0 left-[-5px] max-[720px]:hidden";

export const WORKBENCH_HEADER_CLASS =
  "thread-workbench-header grid gap-2 border-[color-mix(in_srgb,currentColor_10%,transparent)] border-b bg-[linear-gradient(112deg,color-mix(in_srgb,var(--accent)_7%,transparent),transparent_60%),color-mix(in_srgb,var(--surface-soft)_76%,transparent)] px-2.75 pt-2.75 pb-2.25 max-[1180px]:gap-2.75 max-[1180px]:px-3.25 max-[1180px]:pt-3.75 max-[1180px]:pb-3 max-[720px]:p-2.5";

export const WORKBENCH_HEADING_CLASS =
  "thread-workbench-heading flex items-center justify-between";

export const WORKBENCH_LOCKUP_CLASS =
  "thread-workbench-lockup flex min-w-0 items-center gap-2.25 [&>div]:grid [&>div]:min-w-0 [&>div]:gap-px [&_small]:truncate [&_small]:font-[var(--font-mono)] [&_small]:text-[8px] [&_small]:leading-[1.2] [&_small]:text-[color-mix(in_srgb,currentColor_42%,transparent)] [&_strong]:truncate [&_strong]:text-sm [&_strong]:tracking-[-0.01em] max-[960px]:[&_strong]:text-[13px]";

export const WORKBENCH_MARK_CLASS =
  "thread-workbench-mark relative grid size-8.5 shrink-0 place-items-center rounded-[7px] border border-[color-mix(in_srgb,var(--accent)_27%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_9%,var(--surface))] font-[var(--font-mono)] text-[9px] leading-none font-[750] tracking-[0.06em] text-[var(--accent)] [&>i]:absolute [&>i]:top-1.25 [&>i]:right-1.25 [&>i]:size-1 [&>i]:rounded-full [&>i]:bg-[var(--accent)] [&>i]:shadow-[0_0_8px_color-mix(in_srgb,var(--accent)_72%,transparent)]";

export const WORKBENCH_KICKER_CLASS =
  "thread-workbench-kicker font-[var(--font-mono)] text-[9px] font-[750] tracking-[0.12em] text-[var(--accent)] uppercase";

export const WORKBENCH_ICON_BUTTON_CLASS =
  "thread-workbench-icon-button inline-flex size-7 cursor-pointer items-center justify-center rounded-[7px] border-0 bg-transparent p-0 text-[color-mix(in_srgb,currentColor_62%,transparent)] hover:bg-[color-mix(in_srgb,currentColor_8%,transparent)] hover:text-[var(--text)] focus-visible:bg-[color-mix(in_srgb,currentColor_8%,transparent)] focus-visible:text-[var(--text)] focus-visible:outline-none max-[720px]:size-8";

export const WORKBENCH_CONTEXT_ROW_CLASS =
  "thread-workbench-context-row flex min-w-0 items-center justify-between gap-2.25 rounded-lg border border-[color-mix(in_srgb,currentColor_8%,transparent)] bg-[var(--surface-soft)] px-2 py-1.75 max-[960px]:items-start max-[960px]:gap-1.75";

export const WORKBENCH_CONTEXT_PRIMARY_CLASS =
  "thread-workbench-context-primary flex min-w-0 flex-1 items-center justify-start gap-2";

export const WORKBENCH_REPO_MARK_CLASS =
  "thread-workbench-repo-mark inline-flex size-6.75 items-center justify-center rounded-md bg-[var(--thread-workbench-accent-soft)] text-sm text-[var(--accent)] max-[960px]:size-6.25";

export const WORKBENCH_CONTEXT_COPY_CLASS =
  "thread-workbench-context-copy grid min-w-0 flex-1 gap-0.75 [&_strong]:truncate [&_strong]:font-[var(--font-mono)] [&_strong]:text-[11px] [&_strong]:leading-[1.2] [&_strong]:font-semibold [&_small]:truncate [&_small]:text-[10px] [&_small]:text-[color-mix(in_srgb,currentColor_53%,transparent)] max-[1180px]:[&_small]:hidden max-[960px]:[&_strong]:text-[10px]";

export const WORKBENCH_CONTEXT_META_CLASS =
  "thread-workbench-context-meta flex min-w-0 shrink-0 flex-wrap items-center justify-end gap-2 font-[var(--font-mono)] text-[7px] leading-none tracking-[0.06em] text-[color-mix(in_srgb,currentColor_42%,transparent)] uppercase [&>.badge]:mr-0.5 [&>span]:inline-flex [&>span]:min-w-0 [&>span]:items-center [&>span]:gap-1.25 [&>span]:truncate [&>span:first-of-type]:text-[color-mix(in_srgb,currentColor_65%,transparent)] [&>span:not(:last-child)]:after:ml-0.75 [&>span:not(:last-child)]:after:text-[color-mix(in_srgb,currentColor_26%,transparent)] [&>span:not(:last-child)]:after:content-['/'] [&_i]:size-1.25 [&_i]:rounded-full [&_i]:bg-[var(--good)] [&_i]:shadow-[0_0_6px_color-mix(in_srgb,var(--good)_60%,transparent)] max-[960px]:justify-start";

export const WORKBENCH_TABS_CLASS =
  "thread-workbench-tabs grid min-w-0 grid-cols-7 gap-0.5 overflow-hidden border-[color-mix(in_srgb,currentColor_9%,transparent)] border-b bg-[color-mix(in_srgb,var(--surface-raised)_32%,transparent)] px-1.5 py-1.25";

export const WORKBENCH_TAB_CLASS =
  "relative grid min-h-10.75 min-w-0 cursor-pointer justify-items-center gap-0.75 rounded-[5px] border border-transparent bg-transparent px-0.5 pt-1 pb-1.25 text-[color-mix(in_srgb,currentColor_48%,transparent)] hover:border-[color-mix(in_srgb,currentColor_12%,transparent)] hover:bg-[color-mix(in_srgb,currentColor_5%,transparent)] hover:text-[var(--text)] focus-visible:border-[color-mix(in_srgb,currentColor_12%,transparent)] focus-visible:bg-[color-mix(in_srgb,currentColor_5%,transparent)] focus-visible:text-[var(--text)] focus-visible:outline-none [&>small]:max-w-full [&>small]:truncate [&>small]:text-[8px] [&>small]:font-semibold max-[720px]:min-h-9.5 max-[720px]:[&>small]:hidden";

export const WORKBENCH_TAB_SELECTED_CLASS =
  "border-[color-mix(in_srgb,var(--accent)_23%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_7%,var(--surface-soft))] text-[var(--accent)]";

export const WORKBENCH_TAB_MARK_CLASS =
  "thread-workbench-tab-mark grid h-4.75 w-5 place-items-center rounded-sm border border-[color-mix(in_srgb,currentColor_12%,transparent)] bg-[color-mix(in_srgb,currentColor_5%,transparent)] font-[var(--font-mono)] text-xs leading-none font-[680]";

export const WORKBENCH_TAB_SIGNAL_CLASS =
  "thread-workbench-tab-signal absolute right-1 bottom-1 size-0.75 rounded-full bg-transparent group-aria-selected:bg-[var(--accent)] group-aria-selected:shadow-[0_0_6px_color-mix(in_srgb,var(--accent)_72%,transparent)]";

export const WORKBENCH_PANEL_CLASS =
  "thread-workbench-panel grid min-h-0 min-w-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-1.75 overflow-hidden p-2.25 focus:outline-none max-[1180px]:px-2.75";

export const WORKBENCH_PANEL_HEADING_CLASS =
  "thread-workbench-panel-heading flex min-h-9.5 shrink-0 items-start justify-between gap-2.5 rounded-[5px] border border-[color-mix(in_srgb,var(--border)_72%,transparent)] bg-[color-mix(in_srgb,var(--surface-raised)_44%,transparent)] px-2 py-1.5 [&>div]:flex [&>div]:min-w-0 [&>div]:items-baseline [&>div]:gap-2 [&_small]:font-[var(--font-mono)] [&_small]:text-[9px] [&_small]:leading-[1.2] [&_small]:text-[color-mix(in_srgb,currentColor_50%,transparent)]";

export const WORKBENCH_PANEL_TITLE_CLASS =
  "thread-workbench-panel-title text-[11px] font-bold";

export const WORKBENCH_TEXT_BUTTON_CLASS =
  "thread-workbench-text-button cursor-pointer border-0 bg-transparent p-1.25 text-[10px] leading-none font-semibold text-[var(--accent)] hover:underline focus-visible:underline disabled:cursor-default disabled:opacity-42 disabled:no-underline";

const WORKBENCH_PANEL_BODY_BASE =
  "thread-workbench-panel-body min-h-0 min-w-0 [&>.notice]:items-start [&>.notice]:flex-col [&>.notice]:[overflow-wrap:anywhere] [&>.notice_span]:shrink-0 [&>.notice_.text-button]:self-end";

export const WORKBENCH_FILES_BODY_CLASS = `${WORKBENCH_PANEL_BODY_BASE} thread-workbench-panel-body--files flex flex-1 flex-col gap-2.5 overflow-hidden`;

export const WORKBENCH_TERMINAL_BODY_CLASS = `${WORKBENCH_PANEL_BODY_BASE} thread-workbench-panel-body--terminal flex flex-1 flex-col gap-2.5 overflow-hidden`;

export const WORKBENCH_CHANGES_BODY_CLASS = `${WORKBENCH_PANEL_BODY_BASE} thread-workbench-panel-body--changes grid grid-rows-[minmax(140px,0.96fr)_minmax(180px,1.04fr)] gap-2.5 overflow-hidden`;

export const WORKBENCH_SCROLL_BODY_CLASS = `${WORKBENCH_PANEL_BODY_BASE} flex flex-1 flex-col gap-2.5 overflow-auto overscroll-contain`;

export const WORKBENCH_PANE_STACK_CLASS =
  "thread-workbench-pane-stack grid min-h-0 min-w-0 gap-2.5 overflow-auto overscroll-contain [scrollbar-gutter:stable] [&>.git-control-panel]:min-h-0 [&>.git-control-panel]:overflow-hidden [&>.git-control-panel_.git-control-scroll]:max-h-full [&>.git-control-panel_.git-control-scroll]:min-h-0 [&>.git-control-panel_.git-control-scroll]:overscroll-contain";

export const WORKBENCH_SPLIT_CLASS =
  "thread-workbench-split grid min-h-37.5 min-w-0 flex-1 grid-rows-[minmax(120px,0.8fr)_minmax(150px,1.2fr)] gap-2.5 overflow-hidden";

export const WORKBENCH_FILE_SPLIT_CLASS = `${WORKBENCH_SPLIT_CLASS} thread-workbench-file-workspace grid-rows-[minmax(132px,0.82fr)_minmax(190px,1.35fr)]`;

export const WORKBENCH_TREE_CLASS =
  "thread-workbench-tree min-h-0 min-w-0 overflow-hidden rounded-lg border border-[color-mix(in_srgb,currentColor_8%,transparent)] bg-[color-mix(in_srgb,black_16%,transparent)] [&_.workspace-file-tree-shell]:h-full [&_.workspace-file-tree-shell]:min-h-0 [&_.workspace-file-tree-header]:min-h-8.5 [&_.workspace-file-tree-header]:bg-[color-mix(in_srgb,currentColor_3%,transparent)] [&_.workspace-file-tree-header]:py-1 [&_.workspace-file-tree-header_strong]:text-[9px] [&_.workspace-file-tree-header_span]:text-[8px] [&_.workspace-tree-extension]:text-[8px] [&_.workspace-file-tree]:p-1 [&_.workspace-file-tree_[role=treeitem]]:min-h-6.25 [&_.workspace-file-tree_[role=treeitem]]:py-0.5 [&_.workspace-tree-name]:text-[10px]";

export const WORKBENCH_EMPTY_CLASS =
  "thread-workbench-empty m-auto px-3 py-6.25 text-center text-[11px] leading-[1.5] text-[color-mix(in_srgb,currentColor_46%,transparent)]";

export const WORKBENCH_PREVIEW_CLASS =
  "thread-workbench-preview grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border border-[color-mix(in_srgb,currentColor_8%,transparent)] bg-[color-mix(in_srgb,black_22%,transparent)] [&>div:first-child]:flex [&>div:first-child]:min-h-8 [&>div:first-child]:items-center [&>div:first-child]:justify-between [&>div:first-child]:gap-2 [&>div:first-child]:border-[color-mix(in_srgb,currentColor_8%,transparent)] [&>div:first-child]:border-b [&>div:first-child]:py-1 [&>div:first-child]:pr-1.75 [&>div:first-child]:pl-2.5 [&_button]:cursor-pointer [&_button]:border-0 [&_button]:bg-transparent [&_button]:p-1.25 [&_button]:text-[10px] [&_button]:leading-none [&_button]:font-semibold [&_button]:text-[var(--accent)] [&_button:hover]:underline [&_button:focus-visible]:underline [&_button:disabled]:cursor-default [&_button:disabled]:opacity-42 [&_button:disabled]:no-underline [&_code]:truncate [&_code]:font-[var(--font-mono)] [&_code]:text-[9px] [&_code]:leading-[1.2] [&_code]:text-[color-mix(in_srgb,currentColor_65%,transparent)] [&_pre]:m-0 [&_pre]:overflow-auto [&_pre]:overscroll-contain [&_pre]:p-2.5 [&_pre]:font-[var(--font-mono)] [&_pre]:text-[9px] [&_pre]:leading-[1.45] [&_pre]:text-[color-mix(in_srgb,currentColor_72%,transparent)] [&_pre]:[scrollbar-gutter:stable] [&_pre]:[tab-size:2] [&_pre]:whitespace-pre-wrap";

export const WORKBENCH_CODE_PREVIEW_CLASS = `${WORKBENCH_PREVIEW_CLASS} thread-workbench-code-preview relative [&>div:first-child]:grid [&>div:first-child]:grid-cols-[minmax(0,1fr)_auto_auto] [&>div:first-child>span]:font-[var(--font-mono)] [&>div:first-child>span]:text-[8px] [&>div:first-child>span]:leading-none [&>div:first-child>span]:font-bold [&>div:first-child>span]:tracking-[0.06em] [&>div:first-child>span]:text-[var(--accent)] [&>div:first-child>span]:uppercase [&>div:first-child>div]:flex [&>div:first-child>div]:shrink-0 [&>div:first-child>div]:gap-0.5`;

export const WORKBENCH_DIFF_PREVIEW_CLASS = `${WORKBENCH_PREVIEW_CLASS} diff [&_pre]:text-[var(--canvas-text-soft)] [&_pre]:whitespace-pre`;

export const WORKBENCH_TERMINAL_PREVIEW_CLASS = `${WORKBENCH_PREVIEW_CLASS} terminal [&_pre]:text-[var(--canvas-text)]`;

export const WORKBENCH_MONACO_CLASS =
  "thread-workbench-monaco relative block min-h-0 min-w-0 overflow-hidden border-0 p-0 [&_.doolittle-code-editor]:rounded-none";

export const WORKBENCH_FILE_EMPTY_CLASS =
  "thread-workbench-file-empty flex min-h-0 flex-col items-center justify-center gap-1.5 p-5 text-center text-[color-mix(in_srgb,currentColor_48%,transparent)] [&_strong]:text-[11px] [&_strong]:text-[var(--text)] [&_p]:m-0 [&_p]:max-w-57.5 [&_p]:text-[9px] [&_p]:leading-[1.45]";

export const WORKBENCH_FILE_EMPTY_ICON_CLASS =
  "thread-workbench-file-empty-icon grid size-8.5 place-items-center rounded-lg border border-[color-mix(in_srgb,var(--accent)_28%,transparent)] bg-[var(--thread-workbench-accent-soft)] font-[var(--font-mono)] text-[11px] leading-none font-bold text-[var(--accent)]";

export const WORKBENCH_CHECKPOINTS_CLASS =
  "thread-workbench-checkpoints mb-0 shrink-0 overflow-hidden rounded-[9px] border border-[color-mix(in_srgb,currentColor_10%,transparent)] bg-[color-mix(in_srgb,currentColor_3%,transparent)] [&>summary]:flex [&>summary]:min-h-8.75 [&>summary]:cursor-pointer [&>summary]:list-none [&>summary]:items-center [&>summary]:justify-between [&>summary]:gap-2 [&>summary]:px-2.25 [&>summary]:py-1.75 [&>summary::-webkit-details-marker]:hidden [&>summary>span]:flex [&>summary>span]:flex-col [&>summary>span]:gap-1.75 [&_small]:m-0 [&_small]:text-[10px] [&_small]:text-[color-mix(in_srgb,currentColor_62%,transparent)] [&_p]:m-0 [&_p]:text-[10px] [&_p]:text-[color-mix(in_srgb,currentColor_62%,transparent)]";

export const WORKBENCH_CHECKPOINTS_BODY_CLASS =
  "thread-workbench-checkpoints-body grid gap-1.75 border-[color-mix(in_srgb,currentColor_10%,transparent)] border-t px-2.25 pt-2 pb-2.25";

export const WORKBENCH_CHECKPOINT_LIST_CLASS =
  "thread-workbench-checkpoint-list grid gap-1.5 [&>div]:flex [&>div]:items-center [&>div]:justify-between [&>div]:gap-1.75 [&_button]:cursor-pointer [&_button]:rounded-md [&_button]:border [&_button]:border-[color-mix(in_srgb,currentColor_16%,transparent)] [&_button]:bg-transparent [&_button]:px-1.75 [&_button]:py-1.25 [&_button]:text-[10px] [&_button]:leading-none [&_button]:font-semibold [&_button]:text-[var(--accent)]";

export const WORKBENCH_CHECKPOINT_DETAILS_CLASS =
  "thread-workbench-checkpoint-details flex flex-col gap-1.75";

export const WORKBENCH_LIST_CLASS =
  "thread-workbench-list grid min-h-0 content-start overflow-auto overscroll-contain [scrollbar-gutter:stable]";

export const WORKBENCH_LIST_BUTTON_CLASS =
  "grid min-h-6.75 cursor-pointer grid-cols-[14px_minmax(0,1fr)_auto] items-center gap-1.75 rounded-md border-0 bg-transparent px-1.75 py-1 text-left font-[var(--font-mono)] text-[10px] leading-[1.35] text-[color-mix(in_srgb,currentColor_72%,transparent)] hover:bg-[color-mix(in_srgb,currentColor_6%,transparent)] hover:text-[var(--text)] focus-visible:bg-[color-mix(in_srgb,currentColor_6%,transparent)] focus-visible:text-[var(--text)] focus-visible:outline-none disabled:cursor-default disabled:opacity-66 [&>span:nth-child(2)]:truncate [&_small]:text-[8px] [&_small]:text-[color-mix(in_srgb,currentColor_43%,transparent)]";

export const WORKBENCH_LIST_BUTTON_SELECTED_CLASS =
  "selected bg-[color-mix(in_srgb,currentColor_6%,transparent)] text-[var(--text)] shadow-[inset_2px_0_0_var(--accent)]";

export function workbenchChangeTone(tone: string): string {
  if (tone === "untracked") return "untracked text-[var(--theme-cyan)]";
  if (tone === "staged") return "staged text-[var(--good)]";
  return "modified text-[var(--warn)]";
}

export const WORKBENCH_TERMINAL_CLASS =
  "thread-workbench-terminal grid min-h-37.5 min-w-0 flex-1 grid-rows-[minmax(120px,0.8fr)_minmax(150px,1.2fr)] gap-2.5 overflow-hidden";

export const WORKBENCH_COMMAND_LIST_CLASS =
  "thread-workbench-command-list grid min-h-0 content-start overflow-auto overscroll-contain [scrollbar-gutter:stable]";

export const WORKBENCH_COMMAND_BUTTON_CLASS =
  "grid min-h-6.75 cursor-pointer grid-cols-1 items-center gap-1.75 rounded-none border-0 border-[color-mix(in_srgb,currentColor_6%,transparent)] border-b bg-transparent px-1.75 py-2 text-left font-[var(--font-mono)] text-[10px] leading-[1.35] text-[color-mix(in_srgb,currentColor_72%,transparent)] hover:bg-[color-mix(in_srgb,currentColor_6%,transparent)] hover:text-[var(--text)] focus-visible:bg-[color-mix(in_srgb,currentColor_6%,transparent)] focus-visible:text-[var(--text)] focus-visible:outline-none [&>span]:truncate [&_small]:text-[8px] [&_small]:text-[color-mix(in_srgb,currentColor_43%,transparent)]";

export const WORKBENCH_PLAN_LIST_CLASS =
  "thread-workbench-plan-list grid min-h-0 min-w-0 flex-1 gap-1.75 overflow-auto overscroll-contain [scrollbar-gutter:stable]";

export const WORKBENCH_PLAN_CARD_CLASS =
  "thread-workbench-plan-card rounded-lg border border-[color-mix(in_srgb,currentColor_7%,transparent)] bg-[color-mix(in_srgb,currentColor_3%,transparent)] p-2.5 [&>div]:flex [&>div]:items-center [&>div]:justify-between [&>div]:gap-2 [&_strong]:text-[11px] [&_p]:my-1.75 [&_p]:text-[10px] [&_p]:leading-[1.5] [&_p]:text-[color-mix(in_srgb,currentColor_65%,transparent)] [&>small]:font-[var(--font-mono)] [&>small]:text-[8px] [&>small]:leading-[1.3] [&>small]:text-[color-mix(in_srgb,currentColor_40%,transparent)]";

export const WORKBENCH_BRIEF_CLASS =
  "thread-workbench-brief grid min-h-0 min-w-0 flex-1 grid-cols-1 gap-2.5 overflow-auto overscroll-contain [scrollbar-gutter:stable] [&>section]:rounded-[10px] [&>section]:border [&>section]:border-[color-mix(in_srgb,currentColor_8%,transparent)] [&>section]:bg-[color-mix(in_srgb,currentColor_3%,transparent)] [&>section]:p-2.5 [&>section>h3]:mt-0 [&>section>h3]:mb-2 [&>section>h3]:text-[10px] [&>section>h3]:font-semibold [&>section>h3]:tracking-[0.03em] [&>section>h3]:uppercase [&_article]:mb-1.75 [&_article>div]:mb-1.75 [&_article>div]:flex [&_article>div]:items-baseline [&_article>div]:justify-between [&_article>div]:gap-2 [&_article>div_span]:text-[9px] [&_article>div_span]:text-[color-mix(in_srgb,currentColor_46%,transparent)] [&_article>div_strong]:text-right [&_article>div_strong]:text-[11px] [&_article>p]:mt-0 [&_article>p]:mb-1.75 [&_article>p]:text-[10px] [&_article>p]:leading-[1.45] [&_article>p]:text-[color-mix(in_srgb,currentColor_64%,transparent)] [&_article>button]:cursor-pointer [&_article>button]:rounded-md [&_article>button]:border [&_article>button]:border-[color-mix(in_srgb,var(--accent)_34%,transparent)] [&_article>button]:bg-[var(--thread-workbench-accent-soft)] [&_article>button]:px-2.25 [&_article>button]:py-1.75 [&_article>button]:font-[var(--font-mono)] [&_article>button]:text-[9px] [&_article>button]:leading-none [&_article>button]:font-[680] [&_article>button]:text-[var(--accent)] [&_article>button:hover]:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] [&_article>button:focus-visible]:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] [&_article>button:focus-visible]:outline-none";

export const WORKBENCH_BRIEF_STACK_CLASS =
  "thread-workbench-brief-stack grid grid-cols-1 gap-2";

export const WORKBENCH_BRIEF_LIST_CLASS =
  "thread-workbench-brief-list grid gap-2";

export const WORKBENCH_BRIEF_EMPTY_CLASS =
  "thread-workbench-brief-empty m-0 text-[10px] leading-[1.45] text-[color-mix(in_srgb,currentColor_48%,transparent)]";

export const WORKBENCH_BRIEF_STAT_CLASS =
  "thread-workbench-brief-stat py-1.75 [&_span]:block [&_strong]:my-1 [&_strong]:block [&_small]:block [&_small]:text-[9px] [&_small]:text-[color-mix(in_srgb,currentColor_46%,transparent)]";

export const WORKBENCH_QUICK_NAV_CLASS =
  "thread-workbench-quick-nav grid gap-1.75 [&_button]:grid [&_button]:min-h-0 [&_button]:w-full [&_button]:items-start [&_button]:justify-items-start [&_button]:gap-0.5 [&_button]:rounded-lg [&_button]:border [&_button]:border-[color-mix(in_srgb,currentColor_16%,transparent)] [&_button]:bg-[color-mix(in_srgb,currentColor_5%,transparent)] [&_button]:px-2.5 [&_button]:py-2 [&_button]:text-left [&_button]:text-[var(--text)] [&_button:hover]:border-[color-mix(in_srgb,currentColor_30%,transparent)] [&_button:hover]:bg-[color-mix(in_srgb,currentColor_8%,transparent)] [&_button:focus-visible]:border-[color-mix(in_srgb,currentColor_30%,transparent)] [&_button:focus-visible]:bg-[color-mix(in_srgb,currentColor_8%,transparent)] [&_button:focus-visible]:outline-none";

export const WORKBENCH_SETTINGS_CLASS =
  "thread-workbench-settings grid min-h-0 min-w-0 flex-1 gap-2 overflow-auto overscroll-contain [scrollbar-gutter:stable] [&>section]:rounded-[10px] [&>section]:border [&>section]:border-[color-mix(in_srgb,currentColor_8%,transparent)] [&>section]:bg-[color-mix(in_srgb,currentColor_3%,transparent)] [&>section]:p-2.5 [&_h3]:mt-0 [&_h3]:mb-2 [&_h3]:text-[10px] [&_h3]:font-semibold [&_h3]:tracking-[0.03em] [&_h3]:uppercase [&_article]:mb-1.5 [&_article_p]:mb-1.5 [&_article_strong]:block [&_article_strong]:text-[10px] [&_article_span]:text-[9px] [&_article_span]:text-[color-mix(in_srgb,currentColor_45%,transparent)] [&_article_small]:text-[9px] [&_article_small]:text-[color-mix(in_srgb,currentColor_45%,transparent)]";

export const WORKBENCH_SETTINGS_GRID_CLASS =
  "thread-workbench-settings-grid grid min-h-0 gap-1.5";

export const WORKBENCH_SETTINGS_ITEM_CLASS =
  "thread-workbench-settings-item flex items-center justify-between gap-2.5 border-[color-mix(in_srgb,currentColor_12%,transparent)] border-t pt-1.5 first:border-t-0 first:pt-0";

export const WORKBENCH_SETTINGS_NAV_CLASS =
  "thread-workbench-settings-nav rounded-[10px] border border-[color-mix(in_srgb,currentColor_8%,transparent)] bg-[color-mix(in_srgb,currentColor_3%,transparent)] p-2.5 [&>summary]:min-h-8.5 [&>summary]:cursor-pointer [&>summary]:list-none [&>summary]:p-0 [&>summary]:text-[10px] [&>summary]:font-semibold [&>summary]:text-[var(--accent)] [&>summary::-webkit-details-marker]:hidden [&>div]:grid [&>div]:gap-1.75 [&>div]:border-[color-mix(in_srgb,currentColor_10%,transparent)] [&>div]:border-t [&>div]:pt-2 [&_button]:grid [&_button]:min-h-0 [&_button]:w-full [&_button]:items-start [&_button]:justify-items-start [&_button]:gap-0.5 [&_button]:rounded-lg [&_button]:border [&_button]:border-[color-mix(in_srgb,currentColor_16%,transparent)] [&_button]:bg-[color-mix(in_srgb,currentColor_5%,transparent)] [&_button]:px-2.5 [&_button]:py-2 [&_button]:text-left [&_button]:text-current [&_button:hover]:border-[color-mix(in_srgb,currentColor_30%,transparent)] [&_button:hover]:bg-[color-mix(in_srgb,currentColor_8%,transparent)] [&_button:focus-visible]:border-[color-mix(in_srgb,currentColor_30%,transparent)] [&_button:focus-visible]:bg-[color-mix(in_srgb,currentColor_8%,transparent)] [&_button:focus-visible]:outline-none [&_button_strong]:text-[var(--text)]";

export const WORKBENCH_PREVIEW_STATUS_CLASS =
  "thread-workbench-preview-status flex min-h-0 min-w-0 flex-1 flex-col items-center overflow-auto overscroll-contain px-4 pt-7 pb-4 text-center [scrollbar-gutter:stable] [&>strong]:mt-2.5 [&>strong]:text-[13px] [&_dl]:m-0 [&_dl]:grid [&_dl]:w-full [&_dl]:gap-0.5 [&_dl>div]:grid [&_dl>div]:grid-cols-[1fr_1.5fr] [&_dl>div]:py-1 [&_dl>div]:text-left [&_dl>div]:font-[var(--font-mono)] [&_dl>div]:text-[9px] [&_dl>div]:leading-[1.4] [&_dt]:text-[color-mix(in_srgb,currentColor_42%,transparent)] [&_dd]:m-0 [&_dd]:truncate";

export const WORKBENCH_PREVIEW_ORBIT_CLASS =
  "thread-workbench-preview-orbit relative mb-4.25 inline-flex size-15 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[var(--thread-workbench-accent-soft)] [&>i]:absolute [&>i]:inset-[-7px] [&>i]:animate-spin [&>i]:rounded-full [&>i]:border [&>i]:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] [&>i]:duration-[4000ms] motion-reduce:[&>i]:animate-none [&>i]:after:absolute [&>i]:after:top-[7px] [&>i]:after:left-[7px] [&>i]:after:size-1.25 [&>i]:after:rounded-full [&>i]:after:bg-[var(--accent)] [&>i]:after:content-['']";

export const WORKBENCH_ORBIT_MARK_CLASS =
  "thread-workbench-orbit-mark text-[21px] text-[var(--accent)]";

export const WORKBENCH_PREVIEW_COPY_CLASS =
  "thread-workbench-preview-copy mt-1.75 mb-4 text-[10px] leading-[1.55] text-[color-mix(in_srgb,currentColor_54%,transparent)]";

export const WORKBENCH_FOOTER_CLASS =
  "thread-workbench-footer flex min-h-8.5 items-center justify-between border-[color-mix(in_srgb,currentColor_8%,transparent)] border-t bg-[color-mix(in_srgb,var(--surface-soft)_70%,transparent)] py-1.25 pr-2 pl-3 font-[var(--font-mono)] text-[8px] leading-none tracking-[0.05em] text-[color-mix(in_srgb,currentColor_42%,transparent)] uppercase";

export const CODING_WORKSPACE_PAGE_CLASS =
  "page coding-workspace-page m-0 flex h-full min-h-0 w-full min-w-0 flex-col gap-1.5 overflow-hidden px-2.25 pt-1.75 pb-2.25 max-[940px]:h-auto max-[940px]:min-h-full max-[940px]:overflow-auto max-[940px]:p-1.5 [&_.badge]:rounded-[3px] [&_.badge]:px-1.25 [&_.badge]:py-0.5 [&_.badge]:text-[length:var(--text-meta)] [&_.empty-block_h3]:text-[15px] [&_.empty-block_p]:text-[13px] [&_.empty-block_p]:leading-[1.55] [&_.notice_span]:text-[13px] [&_.notice_span]:leading-[1.55] [&_.loading-block_span]:text-[11px] [&_.primary-button]:text-[11px] [&_.secondary-button]:text-[11px]";

export const CODING_WORKSPACE_ZEN_CLASS = "!p-0";

const CODING_GRID_BASE =
  "coding-grid grid min-h-0 min-w-0 flex-1 overflow-hidden rounded-none border border-[var(--border)] bg-[var(--surface)] shadow-none [&>.coding-editor:last-child]:border-r-0 max-[940px]:flex-none max-[940px]:grid-cols-1 max-[940px]:grid-rows-[auto_minmax(15rem,1fr)_auto] max-[940px]:overflow-visible";

const fullGrid =
  "[grid-template-columns:var(--coding-explorer-width)_minmax(390px,1fr)_var(--coding-utility-width)] max-[1180px]:[grid-template-columns:min(var(--coding-explorer-width),28vw)_minmax(340px,1fr)_min(var(--coding-utility-width),31vw)] max-[940px]:[grid-template-columns:1fr]";

const explorerHiddenGrid =
  "[grid-template-columns:minmax(390px,1fr)_var(--coding-utility-width)] max-[1180px]:[grid-template-columns:minmax(340px,1fr)_min(var(--coding-utility-width),31vw)] max-[940px]:[grid-template-columns:1fr]";

const utilityHiddenGrid =
  "[grid-template-columns:var(--coding-explorer-width)_minmax(390px,1fr)] max-[1180px]:[grid-template-columns:min(var(--coding-explorer-width),28vw)_minmax(340px,1fr)] max-[940px]:[grid-template-columns:1fr]";

const editorOnlyGrid = "[grid-template-columns:minmax(0,1fr)]";

export function codingGridClass(
  explorerVisible: boolean,
  utilityVisible: boolean,
  zenMode: boolean,
): string {
  const columns = explorerVisible
    ? utilityVisible
      ? fullGrid
      : utilityHiddenGrid
    : utilityVisible
      ? explorerHiddenGrid
      : editorOnlyGrid;
  return `${CODING_GRID_BASE} ${columns} ${zenMode ? "border-0" : ""}`;
}

export const CODING_REPO_HEADER_CLASS =
  "coding-repo-header flex min-h-11 shrink-0 items-center justify-between gap-3 border-[color-mix(in_srgb,var(--border)_72%,transparent)] border-b px-px pt-0 pb-1.25 max-[760px]:items-start max-[760px]:flex-col max-[760px]:gap-2";

export const CODING_REPO_IDENTITY_CLASS =
  "coding-repo-identity flex min-w-0 items-center gap-2.25 [&_.eyebrow]:hidden [&>div:last-child]:min-w-0";

export const CODING_REPO_MARK_CLASS =
  "coding-repo-mark grid size-6.75 shrink-0 place-items-center rounded-[4px] border border-[var(--accent)] bg-[var(--accent)] font-[var(--font-mono)] text-[10px] font-black text-[var(--accent-ink)]";

export const CODING_REPO_TITLE_CLASS =
  "coding-repo-title flex min-w-0 items-center gap-1.75 [&_h1]:m-0 [&_h1]:max-w-[min(35vw,440px)] [&_h1]:truncate [&_h1]:font-[var(--font-display)] [&_h1]:text-sm [&_h1]:font-[680] [&_h1]:tracking-[-0.02em] [&_code]:rounded-[3px] [&_code]:bg-[var(--surface-soft)] [&_code]:px-1.25 [&_code]:py-0.5 [&_code]:text-[length:var(--text-meta)] [&_code]:text-[var(--muted)]";

export const CODING_REPO_PATH_CLASS =
  "mt-0.5 mb-0 max-w-[min(46vw,650px)] truncate font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--muted)]";

export const CODING_REPO_STATE_CLASS =
  "coding-repo-state flex shrink-0 items-center gap-2.75 max-[760px]:w-full max-[760px]:flex-wrap max-[760px]:justify-between [&>span]:flex [&>span]:flex-col [&>span]:gap-0.5 [&>span]:font-[var(--font-mono)] [&>span]:text-[length:var(--text-meta)] [&>span]:tracking-[0.03em] [&>span]:text-[var(--muted)] [&>span]:uppercase";

export const CODING_REPO_STATE_VALUE_CLASS =
  "coding-repo-state-value inline-flex items-center justify-end gap-0.5 text-[10px] text-[var(--text-soft)]";

export const CODING_LAYOUT_CONTROLS_CLASS =
  "coding-layout-controls flex gap-0.5 rounded-[4px] border border-[var(--border)] bg-[var(--surface-soft)] p-0.5";

export const CODING_LAYOUT_BUTTON_CLASS =
  "min-h-5.75 rounded-[var(--radius-xs)] border-0 bg-transparent px-1.5 py-0.75 font-[var(--font-mono)] text-[length:var(--text-meta)] tracking-[0.04em] text-[var(--muted)] uppercase hover:bg-[var(--surface-hover)] hover:text-[var(--text)]";

export const CODING_LAYOUT_BUTTON_SELECTED_CLASS =
  "selected bg-[var(--surface-hover)] text-[var(--text)] shadow-[inset_0_-2px_var(--accent)]";

export const CODING_GLOBAL_NOTICE_CLASS =
  "coding-global-notice mb-2 shrink-0 [&_.notice]:min-h-0 [&_.notice]:px-2.75 [&_.notice]:py-2";

export const CODING_INLINE_STATE_CLASS =
  "coding-inline-state rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--surface-soft)] px-2.75 py-2 text-[13px] text-[var(--text-soft)]";

export const CODING_INLINE_WARN_CLASS =
  "warn border-[color-mix(in_srgb,var(--warn)_25%,var(--border))] bg-[var(--warn-soft)] text-[var(--warn)]";

export const CODING_PANE_CLASS =
  "coding-pane relative flex min-h-0 min-w-0 flex-col bg-[var(--surface)]";

export const CODING_EXPLORER_CLASS =
  "coding-explorer border-[var(--border)] border-r max-[940px]:min-h-[clamp(8rem,20svh,11rem)] max-[940px]:border-r-0 max-[940px]:border-b";

export const CODING_EDITOR_CLASS =
  "coding-editor border-[var(--border)] border-r max-[940px]:min-h-[clamp(15rem,38svh,22rem)] max-[940px]:border-r-0 max-[940px]:border-b";

export const CODING_UTILITY_CLASS =
  "coding-utility max-[940px]:min-h-[clamp(10rem,24svh,14rem)]";

export const CODING_EXPLORER_RESIZER_CLASS =
  "coding-explorer-resizer top-0 right-[-5px] bottom-0 max-[940px]:hidden";

export const CODING_UTILITY_RESIZER_CLASS =
  "coding-utility-resizer top-0 bottom-0 left-[-5px] max-[940px]:hidden";

export const CODING_TABS_CLASS =
  "coding-tabs flex min-h-8.5 shrink-0 items-stretch gap-0.5 border-[var(--border)] border-b bg-[var(--surface)] px-1.25 pt-0.5 pb-0";

export const CODING_TAB_BUTTON_CLASS =
  "relative inline-flex min-w-0 items-center justify-center gap-1.25 rounded-none border-0 bg-transparent px-1.75 pt-1.5 pb-1.75 font-[var(--font-mono)] text-[length:var(--text-meta)] font-bold tracking-[0.07em] text-[var(--muted)] uppercase hover:bg-[var(--surface-hover)] hover:text-[var(--text-soft)] [&>span]:inline-grid [&>span]:h-3.75 [&>span]:min-w-3.75 [&>span]:place-items-center [&>span]:rounded-full [&>span]:bg-[var(--surface-soft)] [&>span]:px-0.75 [&>span]:text-[10px] [&>span]:text-[var(--muted)]";

export const CODING_TAB_SELECTED_CLASS =
  "selected bg-[var(--surface-hover)] text-[var(--text)] after:absolute after:right-1.75 after:bottom-[-1px] after:left-1.75 after:h-0.5 after:bg-[var(--accent)] after:content-['']";

export const CODING_PANE_BODY_CLASS =
  "coding-pane-body min-h-0 flex-1 overflow-auto [scrollbar-color:var(--border-strong)_transparent] [scrollbar-gutter:stable] [scrollbar-width:thin] [&>.loading-block]:m-3 [&>.notice]:m-3 [&>.empty-block]:m-3";

export const CODING_CHANGE_LIST_CLASS = "coding-change-list px-1 py-0.75";

export const CODING_CHANGE_BUTTON_CLASS =
  "grid min-h-9 w-full grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-1.75 rounded-none border-0 border-[color-mix(in_srgb,var(--border)_72%,transparent)] border-b bg-transparent px-1.75 py-1.5 text-left hover:bg-[var(--surface-hover)] [&>span:nth-child(2)]:flex [&>span:nth-child(2)]:min-w-0 [&>span:nth-child(2)]:flex-col [&>span:nth-child(2)]:gap-0.75";

export const CODING_CHANGE_BUTTON_SELECTED_CLASS =
  "selected bg-[var(--surface-hover)] shadow-[inset_2px_0_var(--accent)]";

export const CODING_CHANGE_CODE_CLASS =
  "coding-change-code font-[var(--font-mono)] text-[10px] font-extrabold text-[var(--accent)]";

export const CODING_CHANGE_NAME_CLASS =
  "coding-change-name truncate font-[var(--font-mono)] text-[11px] font-semibold";

export const CODING_CHANGE_PATH_CLASS =
  "coding-change-path truncate font-[var(--font-mono)] text-[10px] text-[var(--muted)]";

export const CODING_CHANGE_BADGES_CLASS =
  "coding-change-badges flex flex-col gap-0.75 [&_i]:rounded-[3px] [&_i]:border [&_i]:border-[var(--border)] [&_i]:bg-[var(--surface-soft)] [&_i]:px-0.75 [&_i]:py-0.25 [&_i]:font-[var(--font-mono)] [&_i]:text-[length:var(--text-meta)] [&_i]:not-italic [&_i]:tracking-[0.05em] [&_i]:text-[var(--muted)] [&_i]:uppercase";

export const CODING_SEARCH_CLASS =
  "coding-search min-h-full [&>.loading-block]:m-3 [&>.notice]:m-3 [&>.empty-block]:m-3 [&>form]:flex [&>form]:gap-1.25 [&>form]:border-[var(--border)] [&>form]:border-b [&>form]:p-2 [&>form>label]:min-w-0 [&>form>label]:flex-1 [&>form_input]:min-h-7.5 [&>form_input]:px-2 [&>form_input]:py-1.75 [&>form_input]:font-[var(--font-mono)] [&>form_input]:text-[11px] [&>form_button]:min-h-7.5 [&>form_button]:px-2.25 [&>form_button]:py-1.5";

export const CODING_WORKTREE_FIELD_CLASS =
  "coding-worktree-field grid gap-1 font-[var(--font-mono)] text-[10px] tracking-[0.04em] text-[var(--muted)] uppercase";

export const CODING_WORKTREE_INPUT_CLASS =
  "coding-worktree-input w-full min-w-0 rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--bg)] px-2 py-1.75 font-[var(--font-mono)] text-[11px] text-[var(--text)] outline-0 focus:border-[var(--accent)] focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_13%,transparent)]";

export const CODING_SEARCH_RESULTS_CLASS =
  "coding-search-results px-1 py-0.75 [&>button]:flex [&>button]:min-h-9 [&>button]:w-full [&>button]:flex-col [&>button]:gap-1 [&>button]:rounded-none [&>button]:border-0 [&>button]:border-[color-mix(in_srgb,var(--border)_72%,transparent)] [&>button]:border-b [&>button]:bg-transparent [&>button]:px-1.75 [&>button]:py-1.5 [&>button]:text-left [&>button:hover]:bg-[var(--surface-hover)]";

export const CODING_SEARCH_PATH_CLASS =
  "coding-search-path truncate font-[var(--font-mono)] text-[11px] font-semibold";

export const CODING_SEARCH_MATCH_CLASS =
  "coding-search-match block w-full truncate pl-2 font-[var(--font-mono)] text-[10px] text-[var(--muted)]";

export const CODING_EDITOR_TOOLBAR_CLASS =
  "coding-editor-toolbar grid min-h-8.5 shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center border-[var(--border)] border-b bg-[var(--surface)] [&>.coding-tabs]:border-b-0";

export const CODING_BREADCRUMB_CLASS =
  "coding-breadcrumb flex min-w-0 items-center justify-start gap-2 px-2 font-[var(--font-mono)] text-[length:var(--text-meta)] text-left text-[var(--muted)] [&>span]:min-w-0 [&>span]:truncate [&>small]:shrink-0 [&>small]:rounded-[3px] [&>small]:border [&>small]:border-[var(--accent-border)] [&>small]:bg-[var(--accent-soft)] [&>small]:px-1.25 [&>small]:py-0.5 [&>small]:text-[length:var(--text-meta)] [&>small]:tracking-[0.04em] [&>small]:text-[color-mix(in_srgb,var(--accent)_76%,var(--text-soft))] [&>small]:uppercase";

export const CODING_EDITOR_ACTIONS_CLASS =
  "coding-editor-actions flex min-w-0 items-center justify-end gap-1.25 pr-1.75 [&_button]:min-h-6.75 [&_button]:px-2 [&_button]:py-1.25";

export const CODING_UNSAVED_CLASS =
  "coding-unsaved-indicator inline-flex items-center gap-1.25 font-[var(--font-mono)] text-[10px] tracking-[0.04em] text-[var(--accent)] uppercase before:size-1.5 before:rounded-full before:bg-[var(--accent)] before:shadow-[0_0_12px_color-mix(in_srgb,var(--accent)_40%,transparent)] before:content-['']";

export const CODING_DIFF_SOURCE_CLASS =
  "coding-diff-source m-0 flex min-w-0 gap-0.5 border-0 py-0 pr-1.75 pl-0 [&_button]:border [&_button]:border-[var(--border)] [&_button]:bg-transparent [&_button]:px-1.75 [&_button]:py-1.25 [&_button]:font-[var(--font-mono)] [&_button]:text-[10px] [&_button]:text-[var(--muted)] [&_button]:uppercase";

export const CODING_DIFF_SOURCE_SELECTED_CLASS =
  "selected border-[var(--accent-border)]! bg-[var(--accent-soft)]! text-[var(--accent)]!";

export const CODING_EDITOR_SURFACE_CLASS =
  "coding-editor-surface relative flex min-h-0 min-w-0 flex-1 flex-col overflow-auto bg-[var(--bg)] [scrollbar-color:var(--border-strong)_transparent] [scrollbar-width:thin] [&>.loading-block]:m-auto [&>.notice]:m-auto [&>.empty-block]:m-auto [&>.coding-inline-state]:mt-2.25 [&>.coding-inline-state]:mr-2.25 [&>.coding-inline-state]:ml-13.25";

export const CODING_ACTION_NOTICE_CLASS =
  "coding-action-notice absolute top-2 right-5 left-14.5 z-5 rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--surface-raised)] px-2.25 py-1.75 text-[11px] leading-[1.45] text-[var(--text-soft)]";

export function codingActionNoticeTone(tone: string): string {
  if (tone === "good")
    return "good border-[color-mix(in_srgb,var(--good)_25%,var(--border))] bg-[var(--good-soft)] text-[var(--good)]";
  if (tone === "warn")
    return "warn border-[color-mix(in_srgb,var(--warn)_25%,var(--border))] bg-[var(--warn-soft)] text-[var(--warn)]";
  if (tone === "bad")
    return "bad border-[color-mix(in_srgb,var(--bad)_25%,var(--border))] bg-[var(--bad-soft)] text-[var(--bad)]";
  return "";
}

export const CODING_SOURCE_CLASS =
  "coding-source m-0 min-h-full min-w-max border-0 bg-transparent pt-4.5 pr-6 pb-11 pl-14.5 font-[var(--font-mono)] text-xs leading-[var(--line-body)] text-[var(--text-soft)] [tab-size:2] whitespace-pre outline-offset-[-3px]";

export const CODING_PATCH_CLASS =
  "coding-patch text-[color-mix(in_srgb,var(--text-soft)_94%,var(--accent))]";

export const CODING_DIFF_LINE_CLASS =
  "coding-diff-line -mx-2 block min-h-[1.68em] px-2";

export function codingDiffLineTone(tone: string): string {
  if (tone === "addition")
    return "addition bg-[color-mix(in_srgb,var(--good)_7%,transparent)] text-[color-mix(in_srgb,var(--good)_74%,var(--text))]";
  if (tone === "removal")
    return "removal bg-[color-mix(in_srgb,var(--bad)_7%,transparent)] text-[color-mix(in_srgb,var(--bad)_76%,var(--text))]";
  if (tone === "header")
    return "header bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] text-[color-mix(in_srgb,var(--accent)_66%,var(--text-soft))]";
  return "";
}

export const CODING_ACP_TASK_CLASS =
  "coding-acp-task flex max-h-36 min-h-11 shrink-0 flex-col gap-1.5 overflow-hidden border-[var(--border)] border-t bg-[var(--surface-raised)] px-2.25 py-1.75";

export const CODING_ACP_TASK_ROW_CLASS =
  "coding-acp-task-row grid min-w-0 grid-cols-[minmax(120px,auto)_minmax(140px,1fr)_auto_auto] items-center gap-1.75 [&_input]:min-h-7.25 [&_input]:w-full [&_input]:min-w-0 [&_input]:rounded-[var(--radius-xs)] [&_input]:border [&_input]:border-[var(--border)] [&_input]:bg-[var(--surface-soft)] [&_input]:px-2 [&_input]:py-1.25 [&_input]:text-[var(--text)] [&_input]:outline-0 [&_input:focus]:border-[var(--border-strong)] [&_button]:min-h-7.25 [&_button]:px-2 [&_button]:py-1.25 [&_button]:whitespace-nowrap";

export const CODING_ACP_TASK_LABEL_CLASS =
  "coding-acp-task-label flex min-w-0 flex-col gap-px font-[var(--font-mono)] text-[length:var(--text-meta)] font-extrabold tracking-[0.06em] text-[var(--text-soft)] uppercase [&_small]:max-w-55 [&_small]:truncate [&_small]:text-[length:var(--text-meta)] [&_small]:font-medium [&_small]:tracking-[0.02em] [&_small]:text-[var(--muted)] [&_small]:normal-case";

export const CODING_ACP_TASK_CLOSE_CLASS =
  "coding-acp-task-close min-w-7.25 p-1 text-base";

export const CODING_ACP_TASK_OUTPUT_CLASS =
  "min-h-0 flex-1 overflow-auto rounded-[var(--radius-xs)] bg-[color-mix(in_srgb,var(--surface-soft)_84%,transparent)] px-1.75 py-1.25 text-[10px] leading-[1.45] text-[var(--text-soft)] [scrollbar-color:var(--border-strong)_transparent] [scrollbar-width:thin] whitespace-pre-wrap";

export const CODING_EDITOR_STATUS_CLASS =
  "coding-editor-status flex min-h-7 shrink-0 items-center gap-2.25 border-[var(--border)] border-t bg-[var(--surface-raised)] px-2.25 font-[var(--font-mono)] text-[10px] tracking-[0.06em] text-[var(--muted)] [&>span]:whitespace-nowrap";

export const CODING_ACP_STATUS_CLASS =
  "coding-acp-status inline-flex items-center gap-1.25 whitespace-nowrap [&>i]:size-1.25 [&>i]:rounded-full [&>i]:bg-current";

export const CODING_STATUS_ACTION_CLASS =
  "coding-status-action min-h-5.25 rounded-[var(--radius-xs)] border-0 bg-[var(--accent)] px-1.75 py-0.75 font-[var(--font-mono)] text-[length:var(--text-meta)] font-extrabold tracking-[0.03em] text-[var(--accent-ink)] uppercase";

export const CODING_COMMIT_LIST_CLASS =
  "coding-commit-list p-2.5 [&_article]:relative [&_article]:grid [&_article]:min-h-11 [&_article]:grid-cols-[13px_minmax(0,1fr)] [&_article]:gap-1.75 [&_article>span]:relative [&_article>span]:mt-1 [&_article>span]:size-1.75 [&_article>span]:rounded-full [&_article>span]:border-2 [&_article>span]:border-[var(--accent)] [&_article>span]:bg-[var(--surface)] [&_article:not(:last-child)>span]:after:absolute [&_article:not(:last-child)>span]:after:top-1.75 [&_article:not(:last-child)>span]:after:bottom-[-35px] [&_article:not(:last-child)>span]:after:left-px [&_article:not(:last-child)>span]:after:w-px [&_article:not(:last-child)>span]:after:bg-[var(--border-strong)] [&_article:not(:last-child)>span]:after:content-[''] [&_article>div]:flex [&_article>div]:min-w-0 [&_article>div]:flex-col [&_article>div]:gap-1.25 [&_code]:text-[10px] [&_code]:text-[var(--muted)]";

export const CODING_COMMIT_SUBJECT_CLASS =
  "coding-commit-subject truncate text-[11px] leading-[1.35] font-semibold";

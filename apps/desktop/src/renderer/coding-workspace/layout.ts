export const CODING_WORKSPACE_PAGE_CLASS =
  "coding-workspace-page m-0 flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden p-0 [&_.badge]:rounded-[3px] [&_.badge]:px-1.25 [&_.badge]:py-0.5 [&_.badge]:text-[length:var(--text-meta)] [&_.empty-block_h3]:text-[15px] [&_.empty-block_p]:text-[13px] [&_.empty-block_p]:leading-[1.55] [&_.notice_span]:text-[13px] [&_.notice_span]:leading-[1.55] [&_.loading-block_span]:text-[length:var(--text-control)] [&_.primary-button]:text-[length:var(--text-control)] [&_.secondary-button]:text-[length:var(--text-control)]";

const CODING_GRID_BASE =
  "coding-grid relative isolate grid min-h-0 min-w-0 flex-1 grid-rows-[minmax(0,1fr)] overflow-hidden bg-[var(--surface)]";

const fullGrid =
  "grid-cols-[var(--coding-explorer-width)_minmax(0,1fr)_var(--coding-utility-width)]";

const explorerHiddenGrid =
  "grid-cols-[minmax(0,1fr)_var(--coding-utility-width)]";

const utilityHiddenGrid =
  "grid-cols-[var(--coding-explorer-width)_minmax(0,1fr)]";

const editorOnlyGrid = "grid-cols-[minmax(0,1fr)]";

export function codingGridClass(
  explorerDocked: boolean,
  utilityDocked: boolean,
) {
  const columns = explorerDocked
    ? utilityDocked
      ? fullGrid
      : utilityHiddenGrid
    : utilityDocked
      ? explorerHiddenGrid
      : editorOnlyGrid;
  return `${CODING_GRID_BASE} ${columns}`;
}

export const CODING_REPO_HEADER_CLASS =
  "coding-repo-header grid shrink-0 gap-1 border-[var(--border)] border-b";

export const CODING_LAYOUT_BUTTON_CLASS =
  "grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] border border-transparent text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] aria-pressed:border-[var(--border)] aria-pressed:bg-[var(--surface-raised)] aria-pressed:text-[var(--text)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--focus-ring)] disabled:opacity-50 max-[760px]:size-11";

export const CODING_GLOBAL_NOTICE_CLASS =
  "coding-global-notice mb-2 shrink-0 [&_.notice]:min-h-0 [&_.notice]:px-2.75 [&_.notice]:py-2";

export const CODING_INLINE_STATE_CLASS =
  "coding-inline-state rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--surface-soft)] px-2.75 py-2 text-[13px] text-[var(--text-soft)]";

export const CODING_PANE_CLASS =
  "coding-pane relative flex min-h-0 min-w-0 flex-col bg-[var(--surface)]";

export const CODING_PANE_OVERLAY_CLASS =
  "data-[overlay=true]:absolute data-[overlay=true]:inset-y-0 data-[overlay=true]:z-50 data-[overlay=true]:shadow-[var(--shell-shadow-lg)]";

export const CODING_PANE_TABS_CLASS =
  "flex min-w-0 shrink-0 items-center border-[var(--border)] border-b [&_.coding-tabs]:flex-1 [&_.coding-tabs]:border-b-0";

export const CODING_PANE_DISMISS_CLASS =
  "mr-1 grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)] text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--focus-ring)]";

export const CODING_EXPLORER_CLASS =
  "coding-explorer @container/explorer border-[var(--border)] border-r data-[overlay=true]:left-0 data-[overlay=true]:w-[min(var(--coding-explorer-width),calc(100%_-_1rem))]";

export const CODING_EXPLORER_TABS_CLASS =
  "[&_.coding-tabs]:grid [&_.coding-tabs]:grid-cols-3 [&_.coding-tabs]:gap-0.5 [&_.coding-tabs]:overflow-visible [&_[role=tab]]:min-w-0 [&_[role=tab]]:px-0.5 @min-[192px]/explorer:data-[compact=false]:[&_[role=tab]>svg]:hidden @max-[192px]/explorer:[&_.coding-tab-label]:sr-only data-[compact=true]:[&_.coding-tab-label]:sr-only";

export const CODING_EDITOR_CLASS = "coding-editor @container/code flex-1";

export const CODING_UTILITY_CLASS =
  "coding-utility border-[var(--border)] border-l data-[overlay=true]:right-0 data-[overlay=true]:w-[min(var(--coding-utility-width),calc(100%_-_1rem))]";

export const CODING_EXPLORER_RESIZER_CLASS =
  "coding-explorer-resizer top-0 right-[-5px] bottom-0";

export const CODING_UTILITY_RESIZER_CLASS =
  "coding-utility-resizer top-0 bottom-0 left-[-5px]";

export const CODING_PANE_BODY_CLASS =
  "coding-pane-body min-h-0 flex-1 overflow-auto [scrollbar-color:var(--border-strong)_transparent] [scrollbar-gutter:stable] [scrollbar-width:thin] [&>.loading-block]:m-3 [&>.notice]:m-3 [&>.empty-block]:m-3";

export const CODING_CHANGE_LIST_CLASS = "coding-change-list px-1 py-0.75";

export const CODING_CHANGE_BUTTON_CLASS =
  "grid min-h-9 w-full grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-1.75 rounded-none border-0 border-[color-mix(in_srgb,var(--border)_72%,transparent)] border-b bg-transparent px-1.75 py-1.5 text-left hover:bg-[var(--surface-hover)] [&>span:nth-child(2)]:flex [&>span:nth-child(2)]:min-w-0 [&>span:nth-child(2)]:flex-col [&>span:nth-child(2)]:gap-0.75";

export const CODING_CHANGE_BUTTON_SELECTED_CLASS =
  "selected font-semibold text-[var(--text)]";

export const CODING_CHANGE_CODE_CLASS =
  "coding-change-code font-[var(--font-mono)] text-[length:var(--text-meta)] font-extrabold text-[var(--accent-text)]";

export const CODING_CHANGE_NAME_CLASS =
  "coding-change-name truncate font-[var(--font-mono)] text-[length:var(--text-control)] font-semibold";

export const CODING_CHANGE_PATH_CLASS =
  "coding-change-path truncate font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--muted)]";

export const CODING_CHANGE_BADGES_CLASS =
  "coding-change-badges flex flex-col gap-0.75 [&_i]:rounded-[3px] [&_i]:border [&_i]:border-[var(--border)] [&_i]:bg-[var(--surface-soft)] [&_i]:px-0.75 [&_i]:py-0.25 [&_i]:font-[var(--font-mono)] [&_i]:text-[length:var(--text-meta)] [&_i]:not-italic [&_i]:tracking-[0.05em] [&_i]:text-[var(--muted)] [&_i]:uppercase";

export const CODING_SEARCH_CLASS =
  "coding-search min-h-full [&>.loading-block]:m-3 [&>.notice]:m-3 [&>.empty-block]:m-3 [&>form]:flex [&>form]:gap-1.25 [&>form]:border-[var(--border)] [&>form]:border-b [&>form]:p-2 [&>form>label]:min-w-0 [&>form>label]:flex-1 [&>form_input]:min-h-7.5 [&>form_input]:px-2 [&>form_input]:py-1.75 [&>form_input]:font-[var(--font-mono)] [&>form_input]:text-[length:var(--text-control)] [&>form_button]:min-h-7.5 [&>form_button]:px-2.25 [&>form_button]:py-1.5";

export const CODING_WORKTREE_FIELD_CLASS =
  "coding-worktree-field grid gap-1 font-[var(--font-mono)] text-[length:var(--text-meta)] tracking-[0.04em] text-[var(--muted)] uppercase";

export const CODING_WORKTREE_INPUT_CLASS =
  "coding-worktree-input w-full min-w-0 rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--bg)] px-2 py-1.75 font-[var(--font-mono)] text-[length:var(--text-control)] text-[var(--text)] outline-0 focus-visible:border-[var(--text-soft)]";

export const CODING_SEARCH_RESULTS_CLASS =
  "coding-search-results px-1 py-0.75 [&>button]:flex [&>button]:min-h-9 [&>button]:w-full [&>button]:flex-col [&>button]:gap-1 [&>button]:rounded-none [&>button]:border-0 [&>button]:border-[color-mix(in_srgb,var(--border)_72%,transparent)] [&>button]:border-b [&>button]:bg-transparent [&>button]:px-1.75 [&>button]:py-1.5 [&>button]:text-left [&>button:hover]:bg-[var(--surface-hover)]";

export const CODING_SEARCH_PATH_CLASS =
  "coding-search-path truncate font-[var(--font-mono)] text-[length:var(--text-control)] font-semibold";

export const CODING_SEARCH_MATCH_CLASS =
  "coding-search-match block w-full truncate pl-2 font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--muted)]";

export const CODING_EDITOR_SURFACE_CLASS =
  "coding-editor-surface relative flex min-h-0 min-w-0 flex-1 flex-col overflow-auto bg-[var(--bg)] [scrollbar-color:var(--border-strong)_transparent] [scrollbar-width:thin] [&>.loading-block]:m-auto [&>.notice]:m-auto [&>.empty-block]:m-auto [&>.coding-inline-state]:mt-2 [&>.coding-inline-state]:mr-2 [&>.coding-inline-state]:ml-10";

export function codingActionNoticeTone(tone: string): string {
  if (tone === "good")
    return "good border-[color-mix(in_srgb,var(--good)_25%,var(--border))] bg-[var(--good-soft)] text-[var(--good)]";
  if (tone === "warn")
    return "warn border-[color-mix(in_srgb,var(--warn)_25%,var(--border))] bg-[var(--warn-soft)] text-[var(--warn)]";
  if (tone === "bad")
    return "bad border-[color-mix(in_srgb,var(--bad)_25%,var(--border))] bg-[var(--bad-soft)] text-[var(--bad)]";
  return "";
}

export const CODING_ACP_TASK_CLASS =
  "coding-acp-task flex max-h-36 min-h-11 shrink-0 flex-col gap-1.5 overflow-hidden border-[var(--border)] border-t bg-[var(--surface-raised)] px-2.25 py-1.75";

export const CODING_ACP_TASK_ROW_CLASS =
  "coding-acp-task-row grid min-w-0 grid-cols-[minmax(120px,auto)_minmax(140px,1fr)_auto_auto] items-center gap-1.75 @max-[640px]/code:grid-cols-[minmax(0,1fr)_auto_auto] @max-[640px]/code:[&>label]:col-span-full [&_input]:min-h-7.25 [&_input]:w-full [&_input]:min-w-0 [&_input]:rounded-[var(--radius-xs)] [&_input]:border [&_input]:border-[var(--border)] [&_input]:bg-[var(--surface-soft)] [&_input]:px-2 [&_input]:py-1.25 [&_input]:text-[var(--text)] [&_input]:outline-0 [&_input:focus]:border-[var(--border-strong)] [&_button]:min-h-7.25 [&_button]:px-2 [&_button]:py-1.25 [&_button]:whitespace-nowrap";

export const CODING_ACP_TASK_LABEL_CLASS =
  "coding-acp-task-label flex min-w-0 flex-col gap-px font-[var(--font-mono)] text-[length:var(--text-meta)] font-extrabold tracking-[0.06em] text-[var(--text-soft)] uppercase [&_small]:max-w-55 [&_small]:truncate [&_small]:text-[length:var(--text-meta)] [&_small]:font-medium [&_small]:tracking-[0.02em] [&_small]:text-[var(--muted)] [&_small]:normal-case";

export const CODING_ACP_TASK_CLOSE_CLASS =
  "coding-acp-task-close min-w-7.25 p-1 text-base";

export const CODING_ACP_TASK_OUTPUT_CLASS =
  "min-h-0 flex-1 overflow-auto rounded-[var(--radius-xs)] bg-[color-mix(in_srgb,var(--surface-soft)_84%,transparent)] px-1.75 py-1.25 text-[length:var(--text-meta)] leading-[1.45] text-[var(--text-soft)] [scrollbar-color:var(--border-strong)_transparent] [scrollbar-width:thin] whitespace-pre-wrap";

export const CODING_COMMIT_LIST_CLASS =
  "coding-commit-list p-2.5 [&_article]:relative [&_article]:grid [&_article]:min-h-11 [&_article]:grid-cols-[13px_minmax(0,1fr)] [&_article]:gap-1.75 [&_article>span]:relative [&_article>span]:mt-1 [&_article>span]:size-1.75 [&_article>span]:rounded-full [&_article>span]:border-2 [&_article>span]:border-[var(--accent)] [&_article>span]:bg-[var(--surface)] [&_article:not(:last-child)>span]:after:absolute [&_article:not(:last-child)>span]:after:top-1.75 [&_article:not(:last-child)>span]:after:bottom-[-35px] [&_article:not(:last-child)>span]:after:left-px [&_article:not(:last-child)>span]:after:w-px [&_article:not(:last-child)>span]:after:bg-[var(--border-strong)] [&_article:not(:last-child)>span]:after:content-[''] [&_article>div]:flex [&_article>div]:min-w-0 [&_article>div]:flex-col [&_article>div]:gap-1.25 [&_code]:text-[length:var(--text-meta)] [&_code]:text-[var(--muted)]";

export const CODING_COMMIT_SUBJECT_CLASS =
  "coding-commit-subject truncate text-[length:var(--text-control)] leading-[1.35] font-semibold";

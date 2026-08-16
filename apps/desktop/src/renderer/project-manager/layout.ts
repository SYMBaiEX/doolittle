export const PROJECT_MANAGER_BACKDROP_CLASS =
  "project-manager-backdrop fixed inset-0 z-[95] flex items-center justify-center bg-[color-mix(in_srgb,#000_62%,transparent)] p-7 max-[740px]:items-end max-[740px]:p-0";

export const PROJECT_MANAGER_CLASS =
  "project-manager flex h-[min(780px,calc(100vh-56px))] w-[min(100%,1060px)] max-w-[1060px] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-[var(--surface)] shadow-[0_28px_90px_color-mix(in_srgb,var(--shadow)_76%,transparent)] outline-none max-[740px]:h-[min(90vh,820px)] max-[740px]:w-full max-[740px]:rounded-b-none max-[740px]:rounded-t-[14px] max-[740px]:border-b-0";

export const PROJECT_MANAGER_HEADER_CLASS =
  "project-manager__header flex items-start justify-between border-[var(--border)] border-b px-6 pt-5.5 pb-4.25 max-[740px]:px-4.5 max-[740px]:pt-4.75 max-[740px]:pb-3.5 [&_h2]:mt-1.25 [&_h2]:mb-1.75 [&_h2]:font-[var(--font-display)] [&_h2]:text-base [&_h2]:leading-none [&_h2]:tracking-[-0.02em] [&_p]:m-0 [&_p]:text-[length:var(--text-body)] [&_p]:text-[var(--text-soft)] max-[420px]:[&_p]:hidden";

export const PROJECT_MANAGER_TOOLBAR_CLASS =
  "project-manager__toolbar flex items-center gap-2.5 border-[var(--border)] border-b px-3 py-2.5";

export const PROJECT_MANAGER_SEARCH_CLASS =
  "project-manager__search flex flex-1 items-center gap-1.75 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-raised)] pl-2.5 text-[var(--muted)]";

export const PROJECT_MANAGER_ERROR_CLASS =
  "project-manager__error m-0 border-[color-mix(in_srgb,var(--bad)_36%,var(--border))] border-b bg-[var(--bad-soft)] px-4 py-2.25 text-[13px] text-[var(--bad)]";

export const PROJECT_MANAGER_BODY_CLASS =
  "project-manager__body grid min-h-0 flex-1 grid-cols-[minmax(230px,0.78fr)_minmax(0,1.7fr)] max-[740px]:block max-[740px]:overflow-y-auto";

export const PROJECT_MANAGER_LIST_CLASS =
  "project-manager__list flex flex-col gap-0.5 overflow-y-auto border-[var(--border)] border-r px-2 py-2.5 max-[740px]:min-h-14.25 max-[740px]:flex-row max-[740px]:gap-1.25 max-[740px]:overflow-x-auto max-[740px]:overflow-y-hidden max-[740px]:border-r-0 max-[740px]:border-b max-[740px]:p-2";

export const PROJECT_MANAGER_SCOPE_CLASS =
  "project-manager__scope grid min-h-8.25 grid-cols-[19px_minmax(0,1fr)_auto] items-center gap-2 rounded-[var(--radius-xs)] px-2 py-1.25 text-left text-[13px] text-[var(--text-soft)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)] max-[740px]:min-w-30 max-[740px]:shrink-0 max-[740px]:grid-cols-[20px_minmax(0,1fr)] [&>span]:font-[var(--font-mono)] [&>span]:text-[var(--accent)] [&>small]:text-[11px] [&>small]:font-medium [&>small]:text-[var(--muted)] max-[740px]:[&>small]:hidden";

export const PROJECT_MANAGER_SCOPE_ACTIVE_CLASS =
  "is-active bg-[var(--surface-hover)] text-[var(--text)] shadow-[inset_2px_0_0_var(--accent)]";

export const PROJECT_MANAGER_GROUP_LABEL_CLASS =
  "project-manager__group-label mx-2 mt-3.75 mb-1.25 flex items-center text-[10px] font-bold tracking-[0.1em] text-[var(--muted)] uppercase after:ml-2 after:h-px after:flex-1 after:bg-[var(--border)] max-[740px]:hidden";

export const PROJECT_MANAGER_ROW_CLASS =
  "project-manager__project-row grid min-h-10.5 grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-2 rounded-[var(--radius-xs)] px-2 py-1.25 text-left text-[var(--text-soft)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)] max-[740px]:min-w-30 max-[740px]:shrink-0 max-[740px]:grid-cols-[20px_minmax(0,1fr)] [&>span:nth-child(2)]:grid [&>span:nth-child(2)]:min-w-0 [&_strong]:truncate [&_strong]:text-xs [&_small]:text-[11px] [&_small]:font-medium [&_small]:text-[var(--muted)] [&>b]:text-[13px] [&>b]:font-medium [&>b]:text-[var(--accent)] max-[740px]:[&_small]:hidden max-[740px]:[&>b]:hidden";

export const PROJECT_MANAGER_ROW_SELECTED_CLASS =
  "is-selected bg-[var(--surface-hover)] text-[var(--text)]";

export const PROJECT_MANAGER_ROW_ACTIVE_CLASS =
  "is-active bg-[var(--surface-hover)] text-[var(--text)] shadow-[inset_2px_0_0_var(--accent)]";

export const PROJECT_MANAGER_DETAIL_CLASS =
  "project-manager__detail min-w-0 overflow-y-auto px-7 py-6.5 max-[740px]:min-h-112.5 max-[740px]:px-4 max-[740px]:py-5";

export const PROJECT_EDITOR_BACKDROP_CLASS =
  "project-editor-backdrop absolute inset-0 z-3 flex items-center justify-center bg-[color-mix(in_srgb,#000_42%,transparent)] p-4.5";

export const PROJECT_EDITOR_CLASS =
  "project-editor grid max-h-full w-[min(100%,510px)] gap-3.75 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-raised)] p-5 shadow-[0_18px_48px_color-mix(in_srgb,var(--shadow)_72%,transparent)]";

export const PROJECT_EDITOR_LABEL_CLASS =
  "grid gap-1.5 text-xs text-[var(--text-soft)] [&>small]:text-[11px] [&>small]:text-[var(--muted)]";

export const PROJECT_AVATAR_CLASS =
  "project-avatar inline-flex shrink-0 items-center justify-center border border-[color-mix(in_srgb,var(--project-color)_58%,var(--border))] bg-[color-mix(in_srgb,var(--project-color)_18%,var(--surface-raised))] font-bold leading-none text-[color-mix(in_srgb,var(--project-color)_85%,white)]";

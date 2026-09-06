export const PROJECT_MARK_CLASS =
  "project-rail-mark grid size-6 shrink-0 place-items-center rounded-[7px] border border-[color-mix(in_srgb,var(--project-color,var(--accent))_20%,var(--border))] bg-[color-mix(in_srgb,var(--project-color,var(--accent))_7%,var(--surface-soft))] font-[var(--font-mono)] text-[length:var(--text-meta)] font-bold text-[color-mix(in_srgb,var(--project-color,var(--accent))_74%,var(--text))] uppercase [.desktop-shell.nav-collapsed_&]:size-6.5";

export const NEW_CHAT_SHELL_CLASS =
  "sidebar-new-chat-shell relative w-full [.desktop-shell.nav-collapsed_&]:mx-auto [.desktop-shell.nav-collapsed_&]:w-10.5";

export const NEW_CHAT_TRIGGER_CLASS =
  "grid min-h-8 w-full grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-1.5 rounded-[var(--radius-xs)] border border-transparent bg-[color-mix(in_srgb,var(--accent)_6%,var(--surface-soft))] px-1.5 py-1 text-left text-[var(--text)] transition-colors hover:bg-[color-mix(in_srgb,var(--surface-hover)_68%,transparent)] [&>svg]:mx-auto [&>svg]:text-[var(--accent)] [&>strong]:truncate [&>strong]:text-[length:var(--text-control)] [&>strong]:font-medium [&>kbd]:font-[var(--font-mono)] [&>kbd]:text-[length:var(--text-meta)] [&>kbd]:text-[var(--faint)] [.desktop-shell.nav-collapsed_&]:m-0 [.desktop-shell.nav-collapsed_&]:min-h-10 [.desktop-shell.nav-collapsed_&]:w-10.5 [.desktop-shell.nav-collapsed_&]:grid-cols-1 [.desktop-shell.nav-collapsed_&]:place-items-center [.desktop-shell.nav-collapsed_&]:p-0 [.desktop-shell.nav-collapsed_&]:[&>strong]:hidden [.desktop-shell.nav-collapsed_&]:[&>kbd]:hidden";

export const NEW_CHAT_MENU_CLASS =
  "new-chat-project-menu fixed z-80 grid overflow-hidden overscroll-contain rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[color-mix(in_srgb,var(--surface-raised)_98%,var(--bg))] text-[var(--text)] shadow-[var(--shell-shadow-lg)] [-webkit-app-region:no-drag]";

export const NEW_CHAT_MENU_HEADER_CLASS =
  "flex items-start justify-between gap-3 border-[var(--border)] border-b px-3.5 pt-3.5 pb-2.75 [&>div]:grid [&>div]:gap-0.75 [&_strong]:text-[13px] [&_strong]:font-semibold [&_small]:truncate [&_small]:font-[var(--font-mono)] [&_small]:text-[10px] [&_small]:font-medium [&_small]:text-[var(--muted)]";

export const NEW_CHAT_SEARCH_CLASS =
  "new-chat-project-menu__search mx-2.5 mt-2.25 mb-0.75 grid grid-cols-[18px_minmax(0,1fr)] items-center gap-1.25 rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--surface-soft)] px-2 text-[var(--muted)]";

export const NEW_CHAT_CHOICE_CLASS =
  "grid min-h-10.75 grid-cols-[27px_minmax(0,1fr)_auto] items-center gap-2.25 rounded-[var(--radius-xs)] border border-transparent px-1.75 py-1.5 text-left text-[var(--text-soft)] transition-colors hover:border-[var(--border)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] [&>span:nth-child(2)]:grid [&>span:nth-child(2)]:min-w-0 [&>span:nth-child(2)]:gap-0.5 [&_strong]:truncate [&_strong]:text-xs [&_strong]:font-semibold [&_small]:truncate [&_small]:font-[var(--font-mono)] [&_small]:text-[10px] [&_small]:font-medium [&_small]:text-[var(--muted)] [&>i]:font-[var(--font-mono)] [&>i]:text-[10px] [&>i]:not-italic [&>i]:text-[var(--faint)] [&>svg]:text-[var(--faint)]";

export const SIDEBAR_PROJECTS_CLASS =
  "sidebar-projects flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden pt-1.5 pb-1 [-webkit-app-region:no-drag] [.desktop-shell.nav-collapsed_&]:py-1";

export const SIDEBAR_PROJECTS_HEADING_CLASS =
  "sidebar-projects__heading flex min-h-5.5 items-center justify-between gap-2 px-1 [.desktop-shell.nav-collapsed_&]:mb-0.5 [.desktop-shell.nav-collapsed_&]:min-h-0 [&>span]:flex [&>span]:items-center [&>span]:gap-1.25 [&>span]:font-[var(--font-mono)] [&>span]:text-[length:var(--text-meta)] [&>span]:font-semibold [&>span]:tracking-[0.08em] [&>span]:text-[var(--faint)] [&>span]:uppercase [.desktop-shell.nav-collapsed_&]:[&>span]:hidden [&>span>small]:font-normal [&>span>small]:tracking-normal [&>span>small]:text-[var(--muted)] [&>div]:flex [&>div]:gap-px [.desktop-shell.nav-collapsed_&]:[&>div]:hidden";

export const PROJECT_RAIL_ALL_CLASS =
  "project-rail-all relative grid min-h-7.5 grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-1.5 rounded-[var(--radius-xs)] border border-transparent px-1.25 py-0.75 text-left text-[var(--muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--surface-hover)_64%,transparent)] hover:text-[var(--text)] [&>svg]:mx-auto [&>svg]:text-[var(--accent)] [&>span:nth-child(2)]:min-w-0 [&_strong]:block [&_strong]:truncate [&_strong]:text-[length:var(--text-control)] [&_strong]:font-medium [&>small]:font-[var(--font-mono)] [&>small]:text-[length:var(--text-meta)] [&>small]:text-[var(--faint)] [.desktop-shell.nav-collapsed_&]:mx-auto [.desktop-shell.nav-collapsed_&]:min-h-10 [.desktop-shell.nav-collapsed_&]:w-10.5 [.desktop-shell.nav-collapsed_&]:grid-cols-1 [.desktop-shell.nav-collapsed_&]:place-items-center [.desktop-shell.nav-collapsed_&]:[&>span:nth-child(2)]:hidden [.desktop-shell.nav-collapsed_&]:[&>small]:hidden";

export const PROJECT_RAIL_ACTIVE_CLASS =
  "is-active bg-[color-mix(in_srgb,var(--surface-hover)_66%,transparent)] text-[var(--text)] before:absolute before:top-1.25 before:bottom-1.25 before:left-0 before:w-px before:rounded-full before:bg-[var(--accent)]";

export const PROJECT_RAIL_GROUP_CLASS =
  "project-rail-group relative [.desktop-shell.nav-collapsed_&]:px-0.75";

export const PROJECT_RAIL_GROUP_ACTIVE_CLASS = "is-active";

export const PROJECT_RAIL_ROW_CLASS =
  "project-rail-row grid min-h-7.5 grid-cols-[14px_minmax(0,1fr)_20px_18px] items-center gap-px rounded-[var(--radius-xs)] border border-transparent py-0.25 pr-1 pl-0.25 text-[var(--text-soft)] transition-colors hover:bg-[color-mix(in_srgb,var(--surface-hover)_62%,transparent)] hover:text-[var(--text)] [.desktop-shell.nav-collapsed_&]:min-h-10 [.desktop-shell.nav-collapsed_&]:w-10.5 [.desktop-shell.nav-collapsed_&]:grid-cols-1 [.desktop-shell.nav-collapsed_&]:place-items-center [.desktop-shell.nav-collapsed_&]:p-0";

export const PROJECT_RAIL_ROW_ACTIVE_CLASS =
  "bg-[color-mix(in_srgb,var(--surface-hover)_46%,transparent)] text-[var(--text)] shadow-[inset_2px_0_0_color-mix(in_srgb,var(--accent)_58%,transparent)] [.desktop-shell.nav-collapsed_&]:bg-[color-mix(in_srgb,var(--surface-hover)_42%,transparent)]";

export const PROJECT_RAIL_MAIN_CLASS =
  "project-rail-main grid min-w-0 grid-cols-[24px_minmax(0,1fr)] items-center gap-1.5 p-0 text-left text-inherit [.desktop-shell.nav-collapsed_&]:w-full [.desktop-shell.nav-collapsed_&]:grid-cols-1 [.desktop-shell.nav-collapsed_&]:place-items-center [&>span:last-child]:min-w-0 [.desktop-shell.nav-collapsed_&]:[&>span:last-child]:hidden [&_strong]:block [&_strong]:truncate [&_strong]:text-[length:var(--text-control)] [&_strong]:font-semibold";

export const PROJECT_RAIL_MAIN_ACTIVE_CLASS =
  "[&_strong]:text-[var(--text)] [&_small]:text-[var(--text-soft)]";

export const PROJECT_RAIL_CHAT_CLASS =
  "project-rail-chat grid min-h-6.5 grid-cols-[6px_minmax(0,1fr)_auto] items-center gap-1.25 rounded-[var(--radius-xs)] border border-transparent px-1.25 py-0.75 text-left text-[var(--muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--surface-hover)_68%,transparent)] hover:text-[var(--text)] [&>i]:size-0.75 [&>i]:rounded-full [&>i]:bg-[var(--border-strong)] [&>span]:truncate [&>span]:text-[length:var(--text-control)] [&>time]:font-[var(--font-mono)] [&>time]:text-[length:var(--text-meta)] [&>time]:text-[var(--faint)]";

export const PROJECT_RAIL_CHAT_SELECTED_CLASS =
  "is-selected bg-[color-mix(in_srgb,var(--surface-hover)_66%,transparent)] text-[var(--text)] [&>i]:bg-[var(--accent)]";

export const PROJECT_MARK_CLASS =
  "project-rail-mark grid size-7 shrink-0 place-items-center rounded-lg border border-[color-mix(in_srgb,var(--project-color,var(--accent))_24%,var(--border))] bg-[color-mix(in_srgb,var(--project-color,var(--accent))_10%,var(--surface-soft))] font-[var(--font-mono)] text-[10px] font-bold text-[color-mix(in_srgb,var(--project-color,var(--accent))_78%,var(--text))] uppercase [.desktop-shell.nav-collapsed_&]:size-6.5 [.desktop-shell.nav-collapsed_&]:rounded-[7px]";

export const NEW_CHAT_SHELL_CLASS =
  "sidebar-new-chat-shell relative w-full [.desktop-shell.nav-collapsed_&]:mx-auto [.desktop-shell.nav-collapsed_&]:w-10.5";

export const NEW_CHAT_TRIGGER_CLASS =
  "grid min-h-9 w-full grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-2 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--accent)_15%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface-soft))] px-2 py-1.25 text-left text-[var(--text)] transition-colors hover:bg-[color-mix(in_srgb,var(--surface-hover)_78%,transparent)] [&>svg]:mx-auto [&>svg]:text-[var(--accent)] [&>strong]:truncate [&>strong]:text-xs [&>strong]:font-semibold [&>kbd]:font-[var(--font-mono)] [&>kbd]:text-[length:var(--text-meta)] [&>kbd]:text-[var(--faint)] [.desktop-shell.nav-collapsed_&]:m-0 [.desktop-shell.nav-collapsed_&]:min-h-10 [.desktop-shell.nav-collapsed_&]:w-10.5 [.desktop-shell.nav-collapsed_&]:grid-cols-1 [.desktop-shell.nav-collapsed_&]:place-items-center [.desktop-shell.nav-collapsed_&]:p-0 [.desktop-shell.nav-collapsed_&]:[&>strong]:hidden [.desktop-shell.nav-collapsed_&]:[&>kbd]:hidden";

export const NEW_CHAT_MENU_CLASS =
  "new-chat-project-menu fixed z-80 grid overflow-hidden overscroll-contain rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[color-mix(in_srgb,var(--surface-raised)_98%,var(--bg))] text-[var(--text)] shadow-[var(--shell-shadow-lg)] [-webkit-app-region:no-drag]";

export const NEW_CHAT_MENU_HEADER_CLASS =
  "flex items-start justify-between gap-3 border-[var(--border)] border-b px-3.5 pt-3.5 pb-2.75 [&>div]:grid [&>div]:gap-0.75 [&_strong]:text-[13px] [&_strong]:font-semibold [&_small]:truncate [&_small]:font-[var(--font-mono)] [&_small]:text-[10px] [&_small]:font-medium [&_small]:text-[var(--muted)]";

export const NEW_CHAT_SEARCH_CLASS =
  "new-chat-project-menu__search mx-2.5 mt-2.25 mb-0.75 grid grid-cols-[18px_minmax(0,1fr)] items-center gap-1.25 rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--surface-soft)] px-2 text-[var(--muted)]";

export const NEW_CHAT_CHOICE_CLASS =
  "grid min-h-10.75 grid-cols-[27px_minmax(0,1fr)_auto] items-center gap-2.25 rounded-[var(--radius-xs)] border border-transparent px-1.75 py-1.5 text-left text-[var(--text-soft)] transition-colors hover:border-[var(--border)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] [&>span:nth-child(2)]:grid [&>span:nth-child(2)]:min-w-0 [&>span:nth-child(2)]:gap-0.5 [&_strong]:truncate [&_strong]:text-xs [&_strong]:font-semibold [&_small]:truncate [&_small]:font-[var(--font-mono)] [&_small]:text-[10px] [&_small]:font-medium [&_small]:text-[var(--muted)] [&>i]:font-[var(--font-mono)] [&>i]:text-[10px] [&>i]:not-italic [&>i]:text-[var(--faint)] [&>svg]:text-[var(--faint)]";

export const SIDEBAR_PROJECTS_CLASS =
  "sidebar-projects flex min-h-0 flex-1 flex-col gap-1 overflow-hidden pt-2 pb-1.5 [-webkit-app-region:no-drag] [.desktop-shell.nav-collapsed_&]:py-1.5";

export const SIDEBAR_PROJECTS_HEADING_CLASS =
  "sidebar-projects__heading flex min-h-6 items-center justify-between gap-2 px-1.5 [.desktop-shell.nav-collapsed_&]:mb-0.5 [.desktop-shell.nav-collapsed_&]:min-h-0 [&>span]:flex [&>span]:items-center [&>span]:gap-1.5 [&>span]:font-[var(--font-mono)] [&>span]:text-[length:var(--text-meta)] [&>span]:font-bold [&>span]:tracking-[0.1em] [&>span]:text-[var(--faint)] [&>span]:uppercase [.desktop-shell.nav-collapsed_&]:[&>span]:hidden [&>span>small]:grid [&>span>small]:size-4.5 [&>span>small]:min-w-4.5 [&>span>small]:place-items-center [&>span>small]:rounded-full [&>span>small]:border [&>span>small]:border-[var(--border)] [&>span>small]:bg-[var(--surface-soft)] [&>span>small]:text-[length:var(--text-meta)] [&>span>small]:tracking-normal [&>div]:flex [&>div]:gap-0.5 [.desktop-shell.nav-collapsed_&]:[&>div]:hidden";

export const PROJECT_RAIL_ALL_CLASS =
  "project-rail-all relative grid min-h-10 grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2 rounded-[var(--radius-xs)] border border-transparent px-2 py-1 text-left text-[var(--muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--surface-hover)_76%,transparent)] hover:text-[var(--text)] [&>svg]:mx-auto [&>svg]:text-[var(--accent)] [&>span:nth-child(2)]:grid [&>span:nth-child(2)]:min-w-0 [&>span:nth-child(2)]:gap-px [&_strong]:truncate [&_strong]:text-xs [&_strong]:font-semibold [&_em]:truncate [&_em]:font-[var(--font-mono)] [&_em]:text-[length:var(--text-meta)] [&_em]:not-italic [&_em]:text-[var(--faint)] [&>small]:font-[var(--font-mono)] [&>small]:text-[length:var(--text-meta)] [&>small]:text-[var(--faint)] [.desktop-shell.nav-collapsed_&]:mx-auto [.desktop-shell.nav-collapsed_&]:min-h-10 [.desktop-shell.nav-collapsed_&]:w-10.5 [.desktop-shell.nav-collapsed_&]:grid-cols-1 [.desktop-shell.nav-collapsed_&]:place-items-center [.desktop-shell.nav-collapsed_&]:[&>span:nth-child(2)]:hidden [.desktop-shell.nav-collapsed_&]:[&_em]:hidden [.desktop-shell.nav-collapsed_&]:[&>small]:hidden";

export const PROJECT_RAIL_ACTIVE_CLASS =
  "is-active bg-[color-mix(in_srgb,var(--surface-hover)_76%,transparent)] text-[var(--text)] before:absolute before:top-1.75 before:bottom-1.75 before:-left-3 before:w-0.5 before:bg-[var(--accent)]";

export const PROJECT_RAIL_GROUP_CLASS =
  "project-rail-group relative [.desktop-shell.nav-collapsed_&]:px-0.75";

export const PROJECT_RAIL_ROW_CLASS =
  "project-rail-row grid min-h-10 grid-cols-[16px_minmax(0,1fr)_22px_18px] items-center gap-0.5 rounded-[var(--radius-xs)] border border-transparent py-0.5 pr-1.25 pl-0.25 text-[var(--text-soft)] transition-colors hover:bg-[color-mix(in_srgb,var(--surface-hover)_76%,transparent)] hover:text-[var(--text)] [.desktop-shell.nav-collapsed_&]:min-h-10 [.desktop-shell.nav-collapsed_&]:w-10.5 [.desktop-shell.nav-collapsed_&]:grid-cols-1 [.desktop-shell.nav-collapsed_&]:place-items-center [.desktop-shell.nav-collapsed_&]:p-0";

export const PROJECT_RAIL_MAIN_CLASS =
  "project-rail-main grid min-w-0 grid-cols-[28px_minmax(0,1fr)] items-center gap-2 p-0 text-left text-inherit [.desktop-shell.nav-collapsed_&]:w-full [.desktop-shell.nav-collapsed_&]:grid-cols-1 [.desktop-shell.nav-collapsed_&]:place-items-center [&>span:last-child]:grid [&>span:last-child]:min-w-0 [&>span:last-child]:gap-px [.desktop-shell.nav-collapsed_&]:[&>span:last-child]:hidden [&_strong]:truncate [&_strong]:text-xs [&_strong]:font-semibold [&_small]:truncate [&_small]:font-[var(--font-mono)] [&_small]:text-[length:var(--text-meta)] [&_small]:tracking-[0.01em] [&_small]:text-[var(--muted)]";

export const PROJECT_RAIL_CHAT_CLASS =
  "project-rail-chat grid min-h-7 grid-cols-[8px_minmax(0,1fr)_auto] items-center gap-1.5 rounded-[var(--radius-xs)] border border-transparent px-1.75 py-1 text-left text-[var(--muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--surface-hover)_82%,transparent)] hover:text-[var(--text)] [&>i]:size-1 [&>i]:rounded-full [&>i]:bg-[var(--border-strong)] [&>span]:truncate [&>span]:text-[length:var(--text-control)] [&>time]:font-[var(--font-mono)] [&>time]:text-[length:var(--text-meta)] [&>time]:text-[var(--faint)]";

export const PROJECT_RAIL_CHAT_SELECTED_CLASS =
  "is-selected bg-[color-mix(in_srgb,var(--surface-hover)_82%,transparent)] text-[var(--text)] [&>i]:bg-[var(--accent)] [&>i]:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_10%,transparent)]";

export const DESKTOP_SHELL_CLASS =
  "desktop-shell grid h-full w-full overflow-hidden bg-[var(--bg)] font-[var(--font-sans)] text-[length:var(--text-body)] text-[var(--text)] transition-[grid-template-columns] duration-200 ease-[var(--ease-out)]";

export const APP_MAIN_CLASS =
  "app-main relative flex min-h-0 min-w-0 flex-col overflow-hidden";

export const WINDOW_DRAGBAR_CLASS =
  "window-dragbar relative flex min-h-10 shrink-0 flex-col items-stretch gap-0 border-b border-[var(--line-subtle)] bg-[color-mix(in_srgb,var(--bg)_97%,var(--surface))] text-[var(--muted)] [-webkit-app-region:drag]";

export const WINDOW_DRAGBAR_CHAT_CLASS =
  "window-dragbar--chat flex basis-10 bg-[color-mix(in_srgb,var(--bg)_98%,var(--surface))] border-[color-mix(in_srgb,var(--border)_64%,transparent)] max-[1440px]:[&_.window-context]:hidden max-[760px]:basis-16 max-[760px]:min-h-16 max-[760px]:[&_.window-dragbar-primary]:grid max-[760px]:[&_.window-dragbar-primary]:min-h-16 max-[760px]:[&_.window-dragbar-primary]:grid-cols-[auto_minmax(0,1fr)_auto] max-[760px]:[&_.window-dragbar-primary]:grid-rows-[32px_32px] max-[760px]:[&_.window-dragbar-primary]:gap-x-1.5 max-[760px]:[&_.window-dragbar-primary]:px-2 max-[760px]:[&_.menu-button]:col-start-1 max-[760px]:[&_.menu-button]:row-start-1 max-[760px]:[&_.window-tools]:col-start-3 max-[760px]:[&_.window-tools]:row-start-1 max-[760px]:[&_.chat-chrome-host]:col-span-full max-[760px]:[&_.chat-chrome-host]:row-start-2";

export const WINDOW_DRAGBAR_PRIMARY_CLASS =
  "window-dragbar-primary flex min-h-10 min-w-0 flex-1 items-center gap-2.5 px-3 pl-4";

export const WINDOW_CONTEXT_CLASS =
  "window-context flex min-w-0 flex-[0_1_auto] items-baseline gap-2 [&>span]:font-[var(--font-mono)] [&>span]:text-[length:var(--text-meta)] [&>span]:font-bold [&>span]:tracking-[0.11em] [&>span]:text-[var(--faint)] [&>span]:uppercase [&>strong]:text-xs [&>strong]:font-semibold [&>strong]:tracking-[0.02em] [&>strong]:text-[var(--text)] max-[480px]:[&>span]:hidden";

export const WINDOW_TOOLS_CLASS =
  "window-tools ml-auto flex shrink-0 items-center gap-1.25 [-webkit-app-region:no-drag]";

export const CHAT_CHROME_HOST_CLASS =
  "chat-chrome-host relative flex min-h-0 min-w-0 flex-[1_1_420px] gap-0 overflow-hidden px-2 pr-2 pl-3 [-webkit-app-region:drag] max-[760px]:min-h-0 max-[760px]:p-0";

export const VIEW_CONTAINER_CLASS =
  "view-container min-h-0 min-w-0 flex-1 overflow-y-auto bg-[linear-gradient(90deg,var(--operator-glow),transparent_18%)] bg-no-repeat";

export const VIEW_CONTAINER_WORKSPACE_CLASS = "overflow-hidden bg-[var(--bg)]";

export const SIDEBAR_SCRIM_CLASS =
  "sidebar-scrim fixed inset-0 z-19 border-0 bg-[color-mix(in_srgb,var(--shadow)_65%,transparent)] transition-opacity duration-150";
export const SIDEBAR_SCRIM_HIDDEN_CLASS =
  "pointer-events-none invisible opacity-0";
export const SIDEBAR_SCRIM_VISIBLE_CLASS = "visible opacity-100";

export const APP_SIDEBAR_CLASS =
  "app-sidebar z-20 flex min-h-0 min-w-0 flex-col overflow-hidden border-r border-[color-mix(in_srgb,var(--border)_84%,transparent)] bg-[color-mix(in_srgb,var(--surface)_97%,var(--bg))] px-3 pb-2 [-webkit-app-region:drag]";
export const APP_SIDEBAR_DESKTOP_CLASS = "relative";
export const APP_SIDEBAR_DARWIN_CLASS = "pt-9";
export const APP_SIDEBAR_MOBILE_CLASS =
  "fixed inset-y-0 left-0 z-30 w-[min(88vw,320px)] max-w-full shadow-[var(--shell-shadow-lg)] transition-transform duration-200 ease-[var(--ease-out)]";
export const APP_SIDEBAR_MOBILE_CLOSED_CLASS =
  "pointer-events-none -translate-x-full";
export const APP_SIDEBAR_MOBILE_OPEN_CLASS = "translate-x-0";
export const APP_SIDEBAR_COLLAPSED_CLASS =
  "px-2 [&_.app-brand-copy]:hidden [&_.project-history-sidebar]:hidden [&_.sidebar-dock-heading]:hidden [&_.sidebar-utility-copy]:hidden [&_.sidebar-utility-shortcut]:hidden [&_.sidebar-account>div]:hidden [&_.sidebar-account-arrow]:hidden [&_.sidebar-quick-actions_strong]:hidden [&_.sidebar-quick-actions_kbd]:hidden";

export const APP_BRAND_CLASS =
  "app-brand relative flex min-h-14 shrink-0 items-center gap-2.5 border-b border-[color-mix(in_srgb,var(--border)_76%,transparent)] px-1 pt-0.5 pb-2.5";
export const APP_BRAND_COLLAPSED_CLASS =
  "min-h-20.5 flex-col justify-center gap-1.25 px-0 py-2";
export const APP_BRAND_MARK_CLASS =
  "app-brand-mark relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-[9px] border border-[var(--accent)] bg-[var(--accent)] font-[var(--font-display)] text-base font-extrabold tracking-[-0.06em] text-[var(--accent-ink)] before:absolute before:top-1.25 before:-right-0.5 before:h-px before:w-2.75 before:-rotate-45 before:bg-[color-mix(in_srgb,var(--accent-ink)_58%,transparent)] before:content-[''] after:absolute after:bottom-1.25 after:-left-0.5 after:h-px after:w-2.75 after:-rotate-45 after:bg-[color-mix(in_srgb,var(--accent-ink)_58%,transparent)] after:content-[''] [&>i]:absolute [&>i]:right-1 [&>i]:bottom-1 [&>i]:size-0.75 [&>i]:rounded-full [&>i]:bg-[var(--accent-ink)] [&>span]:-translate-x-px";
export const APP_BRAND_COPY_CLASS =
  "app-brand-copy flex min-w-0 flex-col gap-0.5 [&>span]:whitespace-nowrap [&>span]:font-[var(--font-mono)] [&>span]:text-[length:var(--text-meta)] [&>span]:font-semibold [&>span]:tracking-[0.08em] [&>span]:text-[var(--accent)] [&>span]:uppercase [&>strong]:font-[var(--font-display)] [&>strong]:text-[13px] [&>strong]:font-semibold [&>strong]:tracking-[-0.01em]";
export const SIDEBAR_COLLAPSE_CLASS =
  "sidebar-collapse ml-auto grid size-6.5 place-items-center rounded-[var(--radius-xs)] border border-transparent bg-transparent text-[17px] leading-none text-[var(--muted)] [-webkit-app-region:no-drag] hover:border-[var(--border)] hover:bg-[var(--surface-soft)] hover:text-[var(--text)]";
export const SIDEBAR_COLLAPSE_COLLAPSED_CLASS = "mx-auto h-6 w-8.5 text-sm";

export const SIDEBAR_QUICK_ACTIONS_CLASS =
  "sidebar-quick-actions grid shrink-0 grid-cols-2 gap-1 py-2 pt-2.5 [-webkit-app-region:no-drag] [&>.sidebar-new-chat-shell]:col-span-2 [&>button]:grid [&>button]:min-h-7.5 [&>button]:grid-cols-[16px_minmax(0,1fr)] [&>button]:items-center [&>button]:gap-1.5 [&>button]:rounded-[var(--radius-sm)] [&>button]:border [&>button]:border-transparent [&>button]:bg-transparent [&>button]:px-2 [&>button]:py-1 [&>button]:text-left [&>button]:text-[var(--text-soft)] [&>button:hover]:bg-[color-mix(in_srgb,var(--surface-hover)_78%,transparent)] [&>button:hover]:text-[var(--text)] [&_button>span]:text-center [&_button>span]:text-[14px] [&_button>span]:text-[var(--accent)] [&_button_kbd]:hidden [&_button_strong]:overflow-hidden [&_button_strong]:text-ellipsis [&_button_strong]:whitespace-nowrap [&_button_strong]:text-xs [&_button_strong]:font-semibold [&_.sidebar-new-chat-shell>button]:min-h-9 [&_.sidebar-new-chat-shell>button]:grid-cols-[20px_minmax(0,1fr)_auto] [&_.sidebar-new-chat-shell>button]:border-[color-mix(in_srgb,var(--accent)_15%,var(--border))] [&_.sidebar-new-chat-shell>button]:bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface-soft))] [&_.sidebar-new-chat-shell>button]:text-[var(--text)]";
export const SIDEBAR_QUICK_ACTIONS_COLLAPSED_CLASS =
  "grid-cols-1 [&>button]:mx-auto [&>button]:w-10.5 [&>button]:grid-cols-1 [&>button]:place-items-center [&>.sidebar-new-chat-shell]:col-span-1 [&>.sidebar-new-chat-shell]:mx-auto [&>.sidebar-new-chat-shell]:w-10.5 [&_.sidebar-new-chat-shell>button]:w-10.5 [&_.sidebar-new-chat-shell>button]:grid-cols-1 [&_.sidebar-new-chat-shell>button]:place-items-center";

export const SIDEBAR_FOCUS_NAV_CLASS =
  "sidebar-focus-nav grid shrink-0 gap-1.75 border-t border-[color-mix(in_srgb,var(--border)_76%,transparent)] py-2.5 [-webkit-app-region:no-drag]";
export const SIDEBAR_DOCK_HEADING_CLASS =
  "sidebar-dock-heading flex items-center justify-between px-1 font-[var(--font-mono)] text-[length:var(--text-meta)] leading-[var(--line-meta)] font-bold tracking-[0.1em] text-[var(--faint)] uppercase [&>i]:not-italic [&>i]:tracking-[-0.06em] [&>i]:text-[var(--accent)]";
export const SIDEBAR_MODE_SWITCH_CLASS =
  "sidebar-mode-switch grid grid-cols-3 gap-0.75 rounded-[11px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface-soft)_72%,transparent)] p-1 shadow-[inset_0_1px_color-mix(in_srgb,white_3%,transparent)]";
export const SIDEBAR_MODE_BUTTON_CLASS =
  "relative grid min-h-10 w-full grid-cols-1 place-items-center gap-0.5 rounded-[7px] border border-transparent bg-transparent px-1 py-1 text-[length:var(--text-meta)] font-semibold text-[var(--muted)] hover:bg-[color-mix(in_srgb,var(--surface-hover)_78%,transparent)] hover:text-[var(--text)] [&>.icon]:size-3.5";
export const SIDEBAR_MODE_BUTTON_SELECTED_CLASS =
  "selected border-[color-mix(in_srgb,var(--accent)_18%,var(--border))] bg-[var(--surface-raised)] text-[var(--text)] shadow-[0_5px_14px_color-mix(in_srgb,var(--shadow)_18%,transparent),inset_0_1px_color-mix(in_srgb,white_4%,transparent)] [&>.icon]:text-[var(--accent)]";
export const SIDEBAR_MODE_SIGNAL_CLASS =
  "sidebar-mode-signal absolute top-1.5 right-1.5 size-1 rounded-full bg-transparent";
export const SIDEBAR_MODE_SIGNAL_SELECTED_CLASS =
  "bg-[var(--accent)] shadow-[0_0_7px_color-mix(in_srgb,var(--accent)_72%,transparent)]";

export const SIDEBAR_UTILITY_BUTTON_CLASS =
  "sidebar-utility-button grid min-h-10 grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 rounded-[9px] border border-transparent bg-transparent px-1.5 py-1 text-left text-[var(--muted)] hover:border-[var(--border)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]";
export const SIDEBAR_UTILITY_BUTTON_OPEN_CLASS =
  "is-open border-[var(--border)] bg-[var(--surface-hover)] text-[var(--text)]";
export const SIDEBAR_UTILITY_MARK_CLASS =
  "sidebar-utility-mark grid size-7 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] text-[var(--muted)]";
export const SIDEBAR_UTILITY_MARK_OPEN_CLASS =
  "border-[color-mix(in_srgb,var(--accent)_28%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface-soft))] text-[var(--accent)]";
export const SIDEBAR_UTILITY_COPY_CLASS =
  "sidebar-utility-copy grid min-w-0 gap-0.5 [&>small]:overflow-hidden [&>small]:text-ellipsis [&>small]:whitespace-nowrap [&>small]:font-[var(--font-mono)] [&>small]:text-[length:var(--text-meta)] [&>small]:leading-[var(--line-meta)] [&>small]:text-[var(--faint)] [&>strong]:overflow-hidden [&>strong]:text-ellipsis [&>strong]:whitespace-nowrap [&>strong]:text-[length:var(--text-control)] [&>strong]:font-semibold [&>strong]:text-[var(--text-soft)]";
export const SIDEBAR_UTILITY_SHORTCUT_CLASS =
  "sidebar-utility-shortcut rounded border border-[var(--border)] bg-[var(--surface-soft)] px-1.25 py-0.5 font-[var(--font-mono)] text-[length:var(--text-meta)] font-medium text-[var(--faint)]";

export const SIDEBAR_FOOTER_CLASS =
  "sidebar-footer mt-auto shrink-0 border-t border-[color-mix(in_srgb,var(--border)_76%,transparent)] pt-2 [-webkit-app-region:no-drag]";
export const SIDEBAR_FOOTER_ACTIONS_CLASS =
  "sidebar-footer-actions flex items-center gap-1.5";
export const SIDEBAR_ACCOUNT_CLASS =
  "sidebar-account flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-left hover:border-[var(--border)] hover:bg-[var(--surface-hover)] [&>div]:flex [&>div]:min-w-0 [&>div]:flex-col [&>div]:gap-px [&>small]:mt-0.5 [&>small]:font-[var(--font-mono)] [&>small]:text-[length:var(--text-meta)] [&>small]:text-[var(--muted)] [&>span]:grid [&>span]:size-7 [&>span]:shrink-0 [&>span]:place-items-center [&>span]:rounded-lg [&>span]:border [&>span]:border-[color-mix(in_srgb,var(--accent)_32%,var(--border))] [&>span]:bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface-soft))] [&>span]:font-[var(--font-mono)] [&>span]:text-[length:var(--text-meta)] [&>span]:text-[var(--accent)] [&_strong]:overflow-hidden [&_strong]:text-ellipsis [&_strong]:whitespace-nowrap [&_strong]:text-xs [&_strong]:font-semibold [&_strong]:text-[var(--text)]";
export const SIDEBAR_ACCOUNT_SELECTED_CLASS =
  "selected border-[var(--border)] bg-[var(--surface-hover)]";
export const SIDEBAR_ACCOUNT_ARROW_CLASS =
  "sidebar-account-arrow ml-auto text-base not-italic text-[var(--faint)]";
export const SIDEBAR_APPEARANCE_CLASS =
  "sidebar-appearance-toggle size-8.5 self-center rounded-lg";

export const WINDOW_PROJECT_SCOPE_CLASS =
  "window-project-scope min-h-5.5 max-w-33 truncate rounded-[11px] border border-[var(--line-subtle)] bg-[var(--surface-soft)] px-1.75 py-0.5 font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--muted)] [-webkit-app-region:no-drag] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]";
export const WINDOW_COMMAND_BUTTON_CLASS =
  "window-command-button flex min-h-7.5 w-[min(260px,27vw)] items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[color-mix(in_srgb,var(--surface-soft)_82%,transparent)] px-2 py-1 pl-2.5 text-left text-[length:var(--text-control)] text-[var(--muted)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-soft)] [&_kbd]:rounded [&_kbd]:border [&_kbd]:border-[var(--border)] [&_kbd]:bg-[var(--surface-raised)] [&_kbd]:px-1 [&_kbd]:py-0.5 [&_kbd]:font-[var(--font-mono)] [&_kbd]:text-[length:var(--text-meta)] [&_kbd]:text-[var(--faint)] max-[1180px]:w-47.5 max-[940px]:hidden";
export const WINDOW_COMMAND_BUTTON_COMPACT_CLASS =
  "h-7.5! w-7.5! justify-center p-0 max-[940px]:flex";
export const WINDOW_UTILITY_BUTTON_CLASS =
  "window-utility-button min-h-7 rounded-[var(--radius-xs)] border border-transparent bg-transparent px-2 py-1.25 text-[var(--muted)] hover:border-[var(--line-subtle)] hover:bg-[var(--surface-soft)] hover:text-[var(--text)] aria-expanded:border-[var(--line-subtle)] aria-expanded:bg-[var(--surface-soft)] aria-expanded:text-[var(--text)]";
export const WINDOW_RUNTIME_STATUS_CLASS =
  "window-runtime-status flex min-h-6.5 items-center gap-1.5 rounded-[var(--radius-xs)] px-1.5 py-1 font-[var(--font-mono)] text-[length:var(--text-meta)] tracking-[0.08em] text-[var(--muted)] uppercase [&>i]:size-1.25 [&>i]:rounded-full [&>i]:bg-[var(--muted)]";
export const WINDOW_RUNTIME_STATUS_TONE = {
  ready:
    "ready [&>i]:bg-[var(--good)] [&>i]:shadow-[0_0_8px_color-mix(in_srgb,var(--good)_60%,transparent)]",
  booting: "booting [&>i]:bg-[var(--warn)]",
  degraded: "degraded [&>i]:bg-[var(--bad)]",
  stopped: "stopped",
} as const;

export const ICON_BUTTON_CLASS =
  "icon-button grid size-7.5 shrink-0 place-items-center rounded-[var(--radius-xs)] border border-transparent bg-transparent text-[var(--muted)] hover:border-[var(--border)] hover:bg-[var(--surface-soft)] hover:text-[var(--text)] [&>svg]:size-3.5";
export const MENU_BUTTON_CLASS =
  "menu-button hidden size-7.5 shrink-0 place-items-center rounded-[var(--radius-xs)] border border-transparent bg-transparent text-[var(--muted)] hover:border-[var(--border)] hover:bg-[var(--surface-soft)] hover:text-[var(--text)] max-[940px]:grid [&>svg]:size-3.5";

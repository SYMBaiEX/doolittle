export const DESKTOP_SHELL_CLASS =
  "desktop-shell grid h-full w-full overflow-hidden bg-[var(--bg)] font-[var(--font-sans)] text-[length:var(--text-body)] text-[var(--text)] transition-[grid-template-columns] duration-200 ease-[var(--ease-out)] motion-reduce:transition-none motion-reduce:duration-0";

export const APP_MAIN_CLASS =
  "app-main relative flex min-h-0 min-w-0 flex-col overflow-hidden";

export const WINDOW_DRAGBAR_CLASS =
  "window-dragbar relative flex min-h-10 shrink-0 flex-col items-stretch gap-0 border-b border-[var(--line-subtle)] bg-[color-mix(in_srgb,var(--bg)_97%,var(--surface))] text-[var(--muted)] [-webkit-app-region:drag]";

export const WINDOW_DRAGBAR_CHAT_CLASS =
  "window-dragbar--chat flex basis-10 border-[color-mix(in_srgb,var(--border)_64%,transparent)] bg-[color-mix(in_srgb,var(--bg)_98%,var(--surface))] max-[760px]:basis-[calc(var(--control-height)+40px+var(--space-2))] max-[760px]:min-h-[calc(var(--control-height)+40px+var(--space-2))] max-[760px]:[&_.window-dragbar-primary]:grid max-[760px]:[&_.window-dragbar-primary]:min-h-[calc(var(--control-height)+40px+var(--space-2))] max-[760px]:[&_.window-dragbar-primary]:grid-cols-[auto_minmax(0,1fr)_auto] max-[760px]:[&_.window-dragbar-primary]:grid-rows-[var(--control-height)_40px] max-[760px]:[&_.window-dragbar-primary]:gap-x-1.5 max-[760px]:[&_.window-dragbar-primary]:gap-y-[var(--space-2)] max-[760px]:[&_.window-dragbar-primary]:px-2 max-[760px]:[&_.menu-button]:col-start-1 max-[760px]:[&_.menu-button]:row-start-1 max-[760px]:[&_.window-context]:col-start-2 max-[760px]:[&_.window-context]:row-start-1 max-[760px]:[&_.window-tools]:col-start-3 max-[760px]:[&_.window-tools]:row-start-1 max-[760px]:[&_.chat-chrome-host]:col-span-full max-[760px]:[&_.chat-chrome-host]:row-start-2 max-[480px]:basis-[calc(80px+var(--space-2))] max-[480px]:min-h-[calc(80px+var(--space-2))] max-[480px]:[&_.window-dragbar-primary]:min-h-[calc(80px+var(--space-2))] max-[480px]:[&_.window-dragbar-primary]:grid-rows-[40px_40px] max-[480px]:[.desktop-shell.platform-darwin_&]:basis-[calc(116px+var(--space-2))] max-[480px]:[.desktop-shell.platform-darwin_&]:min-h-[calc(116px+var(--space-2))] max-[480px]:[.desktop-shell.platform-darwin_&]:pt-9";

export const WINDOW_DRAGBAR_PRIMARY_CLASS =
  "window-dragbar-primary flex min-h-10 min-w-0 flex-1 items-center gap-2.5 px-3 pl-4";

export const WINDOW_CONTEXT_CLASS =
  "window-context min-w-0 flex-[0_1_auto] overflow-hidden [&_.window-navigation]:flex [&_.window-navigation]:min-w-0 [&_.window-navigation]:items-center [&_.window-navigation]:gap-2 [&_nav]:min-w-0 [&_nav]:overflow-hidden [&_ol]:m-0 [&_ol]:flex [&_ol]:min-w-0 [&_ol]:list-none [&_ol]:items-center [&_ol]:gap-0 [&_ol]:p-0 [&_li]:flex [&_li]:min-w-0 [&_li]:items-center [&_li+li]:before:mx-1.5 [&_li+li]:before:text-[var(--border-strong)] [&_li+li]:before:content-['/'] [&_.window-breadcrumb-section]:shrink-0 [&_.window-breadcrumb-section_button]:border-0 [&_.window-breadcrumb-section_button]:bg-transparent [&_.window-breadcrumb-section_button]:p-0 [&_.window-breadcrumb-section_button]:font-[var(--font-mono)] [&_.window-breadcrumb-section_button]:text-[length:var(--text-meta)] [&_.window-breadcrumb-section_button]:font-bold [&_.window-breadcrumb-section_button]:tracking-[0.1em] [&_.window-breadcrumb-section_button]:text-[var(--faint)] [&_.window-breadcrumb-section_button]:uppercase [&_.window-breadcrumb-section_button:hover]:text-[var(--text-soft)] [&_.window-breadcrumb-current]:max-w-64 [&_.window-breadcrumb-current]:truncate [&_.window-breadcrumb-current]:text-xs [&_.window-breadcrumb-current]:font-semibold [&_.window-breadcrumb-current]:text-[var(--text)] [&_.window-breadcrumb-project]:shrink-0 max-[1100px]:[&_.window-breadcrumb-current]:max-w-36 max-[720px]:[&_.window-breadcrumb-section]:hidden max-[560px]:[&_.window-breadcrumb-project]:hidden";

export const WINDOW_HISTORY_CONTROLS_CLASS =
  "window-history-controls m-0 flex shrink-0 items-center gap-px rounded-[var(--radius-xs)] border-0 p-0 [-webkit-app-region:no-drag] [&>button]:grid [&>button]:size-6 [&>button]:place-items-center [&>button]:rounded-[var(--radius-xs)] [&>button]:border-0 [&>button]:bg-transparent [&>button]:p-0 [&>button]:text-[var(--muted)] [&>button:hover:not(:disabled)]:bg-[var(--surface-hover)] [&>button:hover:not(:disabled)]:text-[var(--text)] [&>button:disabled]:cursor-default [&>button:disabled]:opacity-25";

export const WINDOW_TOOLS_CLASS =
  "window-tools ml-auto flex shrink-0 items-center gap-1.25 [-webkit-app-region:no-drag] before:mr-1.25 before:h-4 before:w-px before:bg-[var(--line-subtle)] max-[760px]:before:hidden";

export const CHAT_CHROME_HOST_CLASS =
  "chat-chrome-host relative flex min-h-0 min-w-0 flex-[1_1_560px] gap-0 overflow-hidden pr-2 [-webkit-app-region:drag] max-[760px]:min-h-0 max-[760px]:p-0";

export const VIEW_CONTAINER_CLASS =
  "view-container min-h-0 min-w-0 flex-1 overflow-y-auto bg-[linear-gradient(90deg,var(--operator-glow),transparent_18%)] bg-no-repeat";

export const VIEW_CONTAINER_WORKSPACE_CLASS = "overflow-hidden bg-[var(--bg)]";

export const SIDEBAR_SCRIM_CLASS =
  "sidebar-scrim fixed inset-0 z-19 border-0 bg-[color-mix(in_srgb,var(--shadow)_65%,transparent)] transition-opacity duration-150";
export const SIDEBAR_SCRIM_HIDDEN_CLASS =
  "pointer-events-none invisible opacity-0";
export const SIDEBAR_SCRIM_VISIBLE_CLASS = "visible opacity-100";

export const APP_SIDEBAR_CLASS =
  "app-sidebar z-20 flex min-h-0 min-w-0 flex-col overflow-hidden border-r border-[color-mix(in_srgb,var(--border)_70%,transparent)] bg-[color-mix(in_srgb,var(--surface)_97%,var(--bg))] px-2.5 pb-1.5 [-webkit-app-region:drag]";
export const APP_SIDEBAR_DESKTOP_CLASS = "relative";
export const APP_SIDEBAR_DARWIN_CLASS = "pt-9";
export const APP_SIDEBAR_MOBILE_CLASS =
  "fixed inset-y-0 left-0 z-30 w-[min(88vw,320px)] max-w-full shadow-[var(--shell-shadow-lg)] transition-transform duration-200 ease-[var(--ease-out)] motion-reduce:transition-none motion-reduce:duration-0";
export const APP_SIDEBAR_MOBILE_CLOSED_CLASS =
  "pointer-events-none -translate-x-full";
export const APP_SIDEBAR_MOBILE_OPEN_CLASS = "translate-x-0";
export const APP_SIDEBAR_COLLAPSED_CLASS =
  "px-2 [&_.app-brand-copy]:hidden [&_.project-history-sidebar]:hidden [&_.sidebar-utility-copy]:hidden [&_.sidebar-utility-shortcut]:hidden [&_.sidebar-account>div]:hidden [&_.sidebar-account-arrow]:hidden [&_.sidebar-quick-actions_strong]:hidden [&_.sidebar-quick-actions_kbd]:hidden [&_.sidebar-mode-switch_span]:hidden";

export const APP_BRAND_CLASS =
  "app-brand relative flex min-h-11 shrink-0 items-center gap-2 px-0.5 py-1";
export const APP_BRAND_COLLAPSED_CLASS =
  "min-h-16 flex-col justify-center gap-1 px-0 py-1.5";
export const APP_BRAND_MARK_CLASS =
  "app-brand-mark relative grid size-7 shrink-0 place-items-center overflow-hidden rounded-[8px] border border-[var(--accent)] bg-[var(--accent)] font-[var(--font-display)] text-sm font-extrabold tracking-[-0.06em] text-[var(--accent-ink)] before:absolute before:top-1 before:-right-0.5 before:h-px before:w-2.5 before:-rotate-45 before:bg-[color-mix(in_srgb,var(--accent-ink)_58%,transparent)] before:content-[''] after:absolute after:bottom-1 after:-left-0.5 after:h-px after:w-2.5 after:-rotate-45 after:bg-[color-mix(in_srgb,var(--accent-ink)_58%,transparent)] after:content-[''] [&>i]:absolute [&>i]:right-0.75 [&>i]:bottom-0.75 [&>i]:size-0.75 [&>i]:rounded-full [&>i]:bg-[var(--accent-ink)] [&>span]:-translate-x-px";
export const APP_BRAND_HOME_CLASS =
  "app-brand-home flex min-w-0 items-center gap-2.5 rounded-[var(--radius-xs)] border-0 bg-transparent p-0 text-left text-[var(--text)] [-webkit-app-region:no-drag] hover:[&_.app-brand-copy>strong]:text-[var(--accent)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-border)] [.desktop-shell.nav-collapsed_&]:mx-auto [.desktop-shell.nav-collapsed_&]:justify-center";
export const APP_BRAND_COPY_CLASS =
  "app-brand-copy flex min-w-0 flex-col gap-px [&>span]:whitespace-nowrap [&>span]:font-[var(--font-mono)] [&>span]:text-[length:var(--text-meta)] [&>span]:font-medium [&>span]:tracking-[0.07em] [&>span]:text-[var(--accent)] [&>span]:uppercase [&>strong]:font-[var(--font-display)] [&>strong]:text-xs [&>strong]:font-semibold [&>strong]:tracking-[-0.01em]";
export const SIDEBAR_COLLAPSE_CLASS =
  "sidebar-collapse ml-auto grid size-6.5 place-items-center rounded-[var(--radius-xs)] border border-transparent bg-transparent text-[var(--muted)] [-webkit-app-region:no-drag] hover:border-[var(--border)] hover:bg-[var(--surface-soft)] hover:text-[var(--text)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent-border)]";
export const SIDEBAR_COLLAPSE_COLLAPSED_CLASS = "mx-auto h-6 w-8.5";

export const SIDEBAR_QUICK_ACTIONS_CLASS =
  "sidebar-quick-actions grid shrink-0 grid-cols-1 gap-0.5 py-1.5 [-webkit-app-region:no-drag] [&>button]:grid [&>button]:min-h-7.5 [&>button]:grid-cols-[16px_minmax(0,1fr)] [&>button]:items-center [&>button]:gap-1.5 [&>button]:rounded-[var(--radius-xs)] [&>button]:border [&>button]:border-transparent [&>button]:bg-transparent [&>button]:px-1.5 [&>button]:py-1 [&>button]:text-left [&>button]:text-[var(--text-soft)] [&>button:hover]:bg-[color-mix(in_srgb,var(--surface-hover)_68%,transparent)] [&>button:hover]:text-[var(--text)] [&>button:focus-visible]:outline [&>button:focus-visible]:outline-1 [&>button:focus-visible]:outline-offset-1 [&>button:focus-visible]:outline-[var(--accent-border)] [&_button>svg]:mx-auto [&_button>svg]:text-[var(--accent)] [&_button_kbd]:hidden [&_button_strong]:overflow-hidden [&_button_strong]:text-ellipsis [&_button_strong]:whitespace-nowrap [&_button_strong]:text-[length:var(--text-control)] [&_button_strong]:font-medium [&_.sidebar-new-chat-shell>button]:min-h-8 [&_.sidebar-new-chat-shell>button]:grid-cols-[18px_minmax(0,1fr)_auto] [&_.sidebar-new-chat-shell>button]:border-transparent [&_.sidebar-new-chat-shell>button]:bg-[color-mix(in_srgb,var(--accent)_6%,var(--surface-soft))] [&_.sidebar-new-chat-shell>button]:text-[var(--text)]";
export const SIDEBAR_QUICK_ACTIONS_COLLAPSED_CLASS =
  "grid-cols-1 justify-items-center gap-1.5 [&>button]:size-10.5 [&>button]:min-h-10.5 [&>button]:grid-cols-1 [&>button]:place-items-center [&>.sidebar-new-chat-shell]:col-span-1 [&>.sidebar-new-chat-shell]:mx-auto [&>.sidebar-new-chat-shell]:w-10.5 [&_.sidebar-new-chat-shell>button]:size-10.5 [&_.sidebar-new-chat-shell>button]:min-h-10.5 [&_.sidebar-new-chat-shell>button]:grid-cols-1 [&_.sidebar-new-chat-shell>button]:place-items-center";

export const SIDEBAR_FOCUS_NAV_CLASS =
  "sidebar-focus-nav grid shrink-0 py-0.5 [-webkit-app-region:no-drag]";
export const SIDEBAR_MODE_SWITCH_CLASS =
  "sidebar-mode-switch grid grid-cols-2 gap-0.5 rounded-[var(--radius-sm)] bg-[color-mix(in_srgb,var(--surface-soft)_50%,transparent)] p-0.5 [.desktop-shell.nav-collapsed_&]:grid-cols-1 [.desktop-shell.nav-collapsed_&]:justify-items-center [.desktop-shell.nav-collapsed_&]:gap-1 [.desktop-shell.nav-collapsed_&]:bg-transparent [.desktop-shell.nav-collapsed_&]:p-0";
export const SIDEBAR_MODE_BUTTON_CLASS =
  "relative grid min-h-7.5 w-full grid-cols-[14px_auto] place-content-center items-center gap-1.5 rounded-[var(--radius-xs)] border border-transparent bg-transparent px-1.5 py-1 text-[length:var(--text-meta)] font-medium text-[var(--muted)] hover:bg-[color-mix(in_srgb,var(--surface-hover)_64%,transparent)] hover:text-[var(--text)] focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-[var(--accent-border)] [&>.icon]:size-3.5 [.desktop-shell.nav-collapsed_&]:size-10 [.desktop-shell.nav-collapsed_&]:min-h-10 [.desktop-shell.nav-collapsed_&]:grid-cols-1";
export const SIDEBAR_MODE_BUTTON_SELECTED_CLASS =
  "selected bg-[color-mix(in_srgb,var(--surface-hover)_72%,transparent)] text-[var(--text)] [&>.icon]:text-[var(--accent)]";
export const SIDEBAR_MODE_SIGNAL_CLASS =
  "sidebar-mode-signal absolute top-1.5 right-1.5 size-1 rounded-full bg-transparent";
export const SIDEBAR_MODE_SIGNAL_SELECTED_CLASS =
  "bg-[var(--accent)] shadow-[0_0_7px_color-mix(in_srgb,var(--accent)_72%,transparent)]";

export const SIDEBAR_UTILITY_BUTTON_CLASS =
  "sidebar-utility-button grid min-h-10 grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 rounded-[9px] border border-transparent bg-transparent px-1.5 py-1 text-left text-[var(--muted)] hover:border-[var(--border)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-[var(--accent-border)] [.desktop-shell.nav-collapsed_&]:mx-auto [.desktop-shell.nav-collapsed_&]:size-10.5 [.desktop-shell.nav-collapsed_&]:min-h-10.5 [.desktop-shell.nav-collapsed_&]:grid-cols-1 [.desktop-shell.nav-collapsed_&]:place-items-center [.desktop-shell.nav-collapsed_&]:p-0";
export const SIDEBAR_UTILITY_BUTTON_OPEN_CLASS =
  "is-open border-[var(--border)] bg-[var(--surface-hover)] text-[var(--text)]";
export const SIDEBAR_UTILITY_MARK_CLASS =
  "sidebar-utility-mark grid size-7 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] text-[var(--muted)] [&>svg]:size-3.5";
export const SIDEBAR_UTILITY_MARK_OPEN_CLASS =
  "border-[color-mix(in_srgb,var(--accent)_28%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface-soft))] text-[var(--accent)]";
export const SIDEBAR_UTILITY_COPY_CLASS =
  "sidebar-utility-copy grid min-w-0 gap-0.5 [&>small]:overflow-hidden [&>small]:text-ellipsis [&>small]:whitespace-nowrap [&>small]:font-[var(--font-mono)] [&>small]:text-[length:var(--text-meta)] [&>small]:leading-[var(--line-meta)] [&>small]:text-[var(--faint)] [&>strong]:overflow-hidden [&>strong]:text-ellipsis [&>strong]:whitespace-nowrap [&>strong]:text-[length:var(--text-control)] [&>strong]:font-semibold [&>strong]:text-[var(--text-soft)]";
export const SIDEBAR_UTILITY_SHORTCUT_CLASS =
  "sidebar-utility-shortcut rounded border border-[var(--border)] bg-[var(--surface-soft)] px-1.25 py-0.5 font-[var(--font-mono)] text-[length:var(--text-meta)] font-medium text-[var(--faint)]";

export const SIDEBAR_FOOTER_CLASS =
  "sidebar-footer mt-auto shrink-0 pt-1 [-webkit-app-region:no-drag]";
export const SIDEBAR_FOOTER_ACTIONS_CLASS =
  "sidebar-footer-actions flex items-center gap-1.5 [.desktop-shell.nav-collapsed_&]:flex-col [.desktop-shell.nav-collapsed_&]:justify-center";
export const SIDEBAR_ACCOUNT_CLASS =
  "sidebar-account flex min-h-7.5 min-w-0 flex-1 items-center gap-1.5 rounded-[var(--radius-xs)] border border-transparent bg-transparent px-1 py-0.5 text-left hover:bg-[color-mix(in_srgb,var(--surface-hover)_68%,transparent)] [&>div]:flex [&>div]:min-w-0 [&>div]:items-baseline [&>div]:gap-1.5 [&>small]:max-w-20 [&>small]:truncate [&>small]:font-[var(--font-mono)] [&>small]:text-[length:var(--text-meta)] [&>small]:text-[var(--muted)] [&>span]:grid [&>span]:size-6 [&>span]:shrink-0 [&>span]:place-items-center [&>span]:rounded-[7px] [&>span]:border [&>span]:border-[color-mix(in_srgb,var(--accent)_24%,var(--border))] [&>span]:bg-[color-mix(in_srgb,var(--accent)_6%,var(--surface-soft))] [&>span]:font-[var(--font-mono)] [&>span]:text-[length:var(--text-meta)] [&>span]:text-[var(--accent)] [&_strong]:overflow-hidden [&_strong]:text-ellipsis [&_strong]:whitespace-nowrap [&_strong]:text-[length:var(--text-control)] [&_strong]:font-semibold [&_strong]:text-[var(--text)] [.desktop-shell.nav-collapsed_&]:size-10 [.desktop-shell.nav-collapsed_&]:min-h-10 [.desktop-shell.nav-collapsed_&]:flex-none [.desktop-shell.nav-collapsed_&]:justify-center [.desktop-shell.nav-collapsed_&]:p-0";
export const SIDEBAR_ACCOUNT_SELECTED_CLASS =
  "selected bg-[color-mix(in_srgb,var(--surface-hover)_72%,transparent)]";
export const SIDEBAR_ACCOUNT_ARROW_CLASS =
  "sidebar-account-arrow ml-auto text-base not-italic text-[var(--faint)]";
export const SIDEBAR_APPEARANCE_CLASS =
  "sidebar-appearance-toggle size-7.5 self-center rounded-[var(--radius-xs)] [.desktop-shell.nav-collapsed_&]:size-10";

export const WINDOW_PROJECT_SCOPE_CLASS =
  "window-project-scope max-w-33 truncate border-0 bg-transparent p-0 font-[var(--font-sans)] text-[length:var(--text-meta)] font-medium text-[var(--muted)] [-webkit-app-region:no-drag] hover:text-[var(--text)] focus-visible:rounded-sm focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-border)]";
export const WINDOW_COMMAND_BUTTON_CLASS =
  "window-command-button flex min-h-7.5 w-[min(260px,27vw)] items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[color-mix(in_srgb,var(--surface-soft)_82%,transparent)] px-2 py-1 pl-2.5 text-left text-[length:var(--text-control)] text-[var(--muted)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-soft)] [&_kbd]:rounded [&_kbd]:border [&_kbd]:border-[var(--border)] [&_kbd]:bg-[var(--surface-raised)] [&_kbd]:px-1 [&_kbd]:py-0.5 [&_kbd]:font-[var(--font-mono)] [&_kbd]:text-[length:var(--text-meta)] [&_kbd]:text-[var(--faint)] max-[1180px]:w-47.5 max-[940px]:hidden";
export const WINDOW_COMMAND_BUTTON_COMPACT_CLASS =
  "h-7.5! w-7.5! justify-center p-0 max-[940px]:flex max-[480px]:h-10! max-[480px]:w-10!";
export const WINDOW_UTILITY_BUTTON_CLASS =
  "window-utility-button inline-flex min-h-7 items-center gap-1.5 rounded-[var(--radius-xs)] border border-transparent bg-transparent px-2 py-1.25 text-[var(--muted)] hover:border-[var(--line-subtle)] hover:bg-[var(--surface-soft)] hover:text-[var(--text)] aria-expanded:border-[var(--line-subtle)] aria-expanded:bg-[var(--surface-soft)] aria-expanded:text-[var(--text)] max-[480px]:size-10 max-[480px]:justify-center max-[480px]:p-0 max-[480px]:[&>span]:sr-only";
export const WINDOW_RUNTIME_STATUS_CLASS =
  "window-runtime-status flex min-h-6.5 items-center gap-1.5 rounded-[var(--radius-xs)] px-1.5 py-1 font-[var(--font-mono)] text-[length:var(--text-meta)] tracking-[0.08em] text-[var(--muted)] uppercase [&>i]:size-1.25 [&>i]:rounded-full [&>i]:bg-[var(--muted)] max-[480px]:size-10 max-[480px]:justify-center max-[480px]:p-0 max-[480px]:[&>span]:sr-only";
export const WINDOW_RUNTIME_STATUS_TONE = {
  ready:
    "ready [&>i]:bg-[var(--good)] [&>i]:shadow-[0_0_8px_color-mix(in_srgb,var(--good)_60%,transparent)]",
  booting: "booting [&>i]:bg-[var(--warn)]",
  degraded: "degraded [&>i]:bg-[var(--bad)]",
  stopped: "stopped",
} as const;

export const ICON_BUTTON_CLASS =
  "icon-button grid size-7.5 shrink-0 place-items-center rounded-[var(--radius-xs)] border border-transparent bg-transparent text-[var(--muted)] hover:border-[var(--border)] hover:bg-[var(--surface-soft)] hover:text-[var(--text)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent-border)] [&>svg]:size-3.5 max-[480px]:size-10";
export const MENU_BUTTON_CLASS =
  "menu-button hidden size-7.5 shrink-0 place-items-center rounded-[var(--radius-xs)] border border-transparent bg-transparent text-[var(--muted)] hover:border-[var(--border)] hover:bg-[var(--surface-soft)] hover:text-[var(--text)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent-border)] max-[940px]:grid max-[480px]:size-10 [&>svg]:size-3.5";

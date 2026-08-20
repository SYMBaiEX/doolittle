export const COMMAND_PALETTE_CLASS =
  "command-palette z-1700 max-h-[min(590px,calc(100vh-96px))] w-[min(620px,calc(100vw-32px))] gap-0 overflow-hidden rounded-2xl border-[var(--border-strong)] bg-[color-mix(in_srgb,var(--surface-raised)_98%,transparent)] p-0 shadow-[var(--shell-shadow-lg)]";

export const COMMAND_PALETTE_HEADER_CLASS =
  "command-palette__header flex min-h-10 items-center justify-between px-2.5 pt-2 pb-1";
export const COMMAND_PALETTE_HEADING_CLASS =
  "command-palette__heading flex items-center gap-2";
export const COMMAND_PALETTE_MARK_CLASS =
  "command-palette__mark font-[var(--font-mono)] text-[13px] font-bold text-[var(--accent)]";
export const COMMAND_PALETTE_TITLE_CLASS =
  "command-palette__title m-0 text-[11px] font-semibold tracking-[0.02em] text-[var(--text-soft)]";
export const COMMAND_PALETTE_CLOSE_CLASS =
  "command-palette__close h-6 min-w-0 rounded-[5px] border border-[var(--border)] bg-[var(--surface)] px-1.75 font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--muted)] normal-case";
export const COMMAND_PALETTE_LABEL_CLASS =
  "command-palette__label block px-2.5 pt-1.25 pb-2.5";
export const COMMAND_PALETTE_SEARCH_SHELL_CLASS =
  "command-palette__search-shell relative block rounded-[10px] border border-[var(--border)] bg-[var(--surface)] transition-[border-color,box-shadow] duration-150 focus-within:border-[var(--accent-border)] focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_9%,transparent)]";
export const COMMAND_PALETTE_SEARCH_ICON_CLASS =
  "command-palette__search-icon pointer-events-none absolute top-1/2 left-4.25 -translate-y-1/2 font-[var(--font-mono)] text-sm text-[var(--muted)]";
export const COMMAND_PALETTE_SEARCH_CLASS =
  "command-palette__search h-12.5 rounded-[inherit] border-0 bg-transparent pr-3.5 pl-10.75 text-sm text-[var(--text)] shadow-none outline-none focus-visible:ring-0";
export const COMMAND_PALETTE_SCROLL_CLASS =
  "command-palette__scroll h-[min(438px,calc(100vh-246px))] min-h-47 border-y border-[var(--border)]";
export const COMMAND_PALETTE_LIST_CLASS =
  "command-palette__list px-1.75 pt-1.25 pb-2";
export const COMMAND_PALETTE_GROUP_CLASS =
  "command-palette__group m-0 min-w-0 border-0 px-0 pt-1.5 pb-0.5";
export const COMMAND_PALETTE_GROUP_LABEL_CLASS =
  "command-palette__group-label m-0 px-2.5 pt-1.25 pb-1 font-[var(--font-mono)] text-[9px] font-semibold tracking-[0.12em] text-[var(--faint)] uppercase";
export const COMMAND_PALETTE_ITEM_CLASS =
  "command-palette__item relative grid min-h-11.5 w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.75 rounded-[var(--radius-sm)] border border-transparent bg-transparent py-1.75 pr-2.5 pl-3 text-left text-[var(--text-soft)] hover:border-[color-mix(in_srgb,var(--accent)_11%,var(--border))] hover:bg-[color-mix(in_srgb,var(--accent)_7%,var(--surface-hover))] hover:text-[var(--text)] aria-disabled:cursor-default aria-disabled:opacity-40 aria-selected:border-[color-mix(in_srgb,var(--accent)_11%,var(--border))] aria-selected:bg-[color-mix(in_srgb,var(--accent)_7%,var(--surface-hover))] aria-selected:text-[var(--text)] aria-selected:before:absolute aria-selected:before:top-2.25 aria-selected:before:bottom-2.25 aria-selected:before:left-0.75 aria-selected:before:w-0.5 aria-selected:before:rounded-sm aria-selected:before:bg-[var(--accent)] aria-selected:before:content-['']";
export const COMMAND_PALETTE_ITEM_LABEL_CLASS =
  "command-palette__item-label overflow-hidden text-ellipsis whitespace-nowrap text-xs font-semibold";
export const COMMAND_PALETTE_ITEM_DESCRIPTION_CLASS =
  "command-palette__item-description col-start-1 overflow-hidden text-ellipsis whitespace-nowrap text-[length:var(--text-meta)] text-[var(--muted)]";
export const COMMAND_PALETTE_ITEM_SHORTCUT_CLASS =
  "command-palette__item-shortcut col-start-2 row-span-2 row-start-1 flex text-[var(--muted)]";
export const COMMAND_PALETTE_EMPTY_CLASS =
  "command-palette__empty m-0 px-5 py-10.5 text-center text-[length:var(--text-meta)] text-[var(--muted)]";
export const COMMAND_PALETTE_FOOTER_CLASS =
  "command-palette__footer flex min-h-9 items-center justify-between px-3 py-1.75 font-[var(--font-mono)] text-[9px] text-[var(--faint)]";
export const COMMAND_PALETTE_KEY_GUIDE_CLASS =
  "command-palette__key-guide flex items-center gap-1.25 [&_kbd]:min-w-5.25 [&_kbd]:rounded [&_kbd]:border [&_kbd]:border-[var(--border)] [&_kbd]:bg-[var(--surface)] [&_kbd]:px-1 [&_kbd]:py-0.5 [&_kbd]:text-center [&_kbd]:font-[inherit] [&_kbd]:text-[var(--muted)]";
export const COMMAND_SHORTCUT_KEY_CLASS =
  "command-shortcut__key rounded border border-[var(--border)] bg-[var(--surface)] px-1.25 py-0.75 font-[var(--font-mono)] text-[length:var(--text-meta)] text-[inherit]";

export const ROUTE_DIALOG_BACKDROP_CLASS =
  "dialog-backdrop fixed inset-0 z-1000 grid place-items-center overflow-auto bg-[color-mix(in_srgb,var(--shadow)_78%,transparent)] p-[clamp(18px,4vw,54px)] max-[760px]:items-end max-[760px]:p-2.5";
export const ROUTE_DIALOG_CLASS =
  "route-control-dialog w-[min(920px,100%)] max-h-[min(88vh,860px)] overflow-auto rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--accent)_28%,var(--border))] bg-[radial-gradient(circle_at_82%_0%,color-mix(in_srgb,var(--accent)_10%,transparent),transparent_34%),var(--surface-raised)] p-[clamp(18px,3vw,28px)] shadow-[0_30px_90px_color-mix(in_srgb,var(--shadow)_78%,transparent),0_0_0_1px_color-mix(in_srgb,var(--accent)_7%,transparent)] outline-none max-[760px]:max-h-[calc(100vh-20px)] max-[760px]:rounded-[var(--radius-md)_var(--radius-md)_var(--radius-xs)_var(--radius-xs)]";
export const ROUTE_DIALOG_HEADER_CLASS =
  "route-control-header flex items-start justify-between gap-6 border-b border-[var(--border)] pb-4.5 [&_h2]:mt-1.25 [&_h2]:mb-1.75 [&_h2]:text-[clamp(15px,1.2vw,18px)] [&_h2]:leading-[1.1] [&_p]:m-0 [&_p]:max-w-140 [&_p]:leading-[1.55] [&_p]:text-[var(--muted)]";
export const ROUTE_DIALOG_FORM_CLASS = "route-control-form grid gap-4.5 pt-4.5";
export const ROUTE_DIALOG_STATUS_CLASS =
  "route-control-status grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2.5 gap-y-1 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--accent)_14%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_5%,var(--surface-soft))] p-3 max-[760px]:grid-cols-1 [&>small]:col-start-2 [&>small]:text-[var(--muted)] max-[760px]:[&>small]:col-start-1 [&>strong]:overflow-hidden [&>strong]:text-ellipsis [&>strong]:whitespace-nowrap [&>strong]:text-[13px]";
export const ROUTE_PROVIDER_GRID_CLASS =
  "route-provider-grid grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-2.5 max-[760px]:grid-cols-2";
export const ROUTE_PROVIDER_CARD_CLASS =
  "route-provider-card relative grid min-h-32 content-start gap-1.25 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface-soft)_96%,transparent)] p-3 text-left text-[var(--text-soft)] transition-[color,background-color,border-color,transform,box-shadow] hover:-translate-y-px hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] [&>small]:text-[10px] [&>small]:leading-[1.45] [&>small]:text-[var(--muted)] [&>span]:font-[var(--font-mono)] [&>span]:text-[length:var(--text-meta)] [&>span]:tracking-[0.08em] [&>span]:text-[var(--accent)] [&>span]:uppercase [&>strong]:text-[13px]";
export const ROUTE_PROVIDER_CARD_SELECTED_CLASS =
  "selected border-[color-mix(in_srgb,var(--accent)_58%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface-soft))] text-[var(--text)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_10%,transparent)]";
export const ROUTE_PROVIDER_READINESS_CLASS =
  "route-provider-readiness mt-auto place-self-start rounded-full bg-[color-mix(in_srgb,var(--surface-raised)_72%,transparent)] px-1.75 py-0.75 font-[var(--font-mono)] text-[length:var(--text-meta)] not-italic tracking-[0.06em] text-[var(--faint)] uppercase";
export const ROUTE_PROVIDER_READINESS_TONE = {
  neutral: "neutral",
  good: "good bg-[color-mix(in_srgb,var(--good)_14%,transparent)] text-[var(--good)]",
  warn: "warn bg-[color-mix(in_srgb,var(--warn)_14%,transparent)] text-[var(--warn)]",
  bad: "bad bg-[color-mix(in_srgb,var(--bad)_14%,transparent)] text-[var(--bad)]",
} as const;
export const ROUTE_FIELD_GRID_CLASS =
  "field-grid grid grid-cols-2 gap-3 max-[760px]:grid-cols-1 [&_label]:grid [&_label]:gap-1.5 [&_label>span]:font-[var(--font-mono)] [&_label>span]:text-[10px] [&_label>span]:text-[var(--muted)] [&_label>span]:uppercase [&_input]:h-9 [&_input]:w-full [&_input]:rounded-[var(--radius-xs)] [&_input]:border [&_input]:border-[var(--border)] [&_input]:bg-[var(--surface)] [&_input]:px-2.5 [&_input]:text-[var(--text)] [&_input]:outline-none [&_input]:focus-visible:border-[var(--accent-border)] [&_input]:focus-visible:ring-2 [&_input]:focus-visible:ring-[color-mix(in_srgb,var(--accent)_12%,transparent)]";
export const ROUTE_FIELD_SPAN_CLASS =
  "field-span col-span-2 max-[760px]:col-span-1";
export const ROUTE_DIALOG_ACTIONS_CLASS =
  "route-control-actions flex justify-between gap-2 pt-0.5 max-[760px]:flex-col-reverse max-[760px]:[&_button]:w-full";

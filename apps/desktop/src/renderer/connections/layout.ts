export const PROVIDER_CONSOLE_CLASS = "provider-console grid gap-2.5";

export const PROVIDER_SURFACE_CLASS = "provider-surface grid gap-2.25 pt-0.5";

export const PROVIDER_SECTION_HEADING_CLASS =
  "provider-section-heading flex items-center justify-between gap-6 px-0.5 max-[860px]:items-start max-[860px]:flex-col max-[860px]:gap-1.75 [&>div]:grid [&>div]:gap-1 [&_h2]:m-0 [&_h2]:font-[var(--font-display)] [&_h2]:text-sm [&_h2]:font-[650] [&_h2]:tracking-[-0.02em]";

export const PROVIDER_ROSTER_CLASS =
  "provider-roster overflow-hidden rounded-[5px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)]";

export const PROVIDER_ROUTE_SUMMARY_CLASS =
  "provider-route-summary grid min-w-0 grid-cols-[repeat(2,minmax(0,auto))] overflow-hidden rounded-[4px] border border-[var(--line-subtle)] bg-[color-mix(in_srgb,var(--surface-raised)_64%,transparent)] max-[860px]:w-full max-[860px]:grid-cols-2 [&>div]:grid [&>div]:min-w-0 [&>div]:grid-cols-[auto_auto] [&>div]:items-baseline [&>div]:gap-2 [&>div]:border-[var(--line-subtle)] [&>div]:border-l [&>div]:px-2.5 [&>div]:py-1.5 [&>div:first-child]:border-l-0 [&_dt]:font-[var(--font-mono)] [&_dt]:text-[length:var(--text-meta)] [&_dt]:tracking-[0.06em] [&_dt]:text-[var(--muted)] [&_dt]:uppercase [&_dd]:m-0 [&_dd]:min-w-0 [&_dd]:truncate [&_dd]:text-[length:var(--text-control)] [&_dd]:font-semibold [&_dd]:text-[var(--text-soft)]";

export const PROVIDER_CONNECTION_ROW_CLASS =
  "provider-connection-row relative grid min-h-16 grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-2.75 border-[var(--line-subtle)] border-b px-3 py-2 transition-colors last:border-b-0 hover:bg-[color-mix(in_srgb,var(--surface-raised)_74%,transparent)] max-[860px]:grid-cols-[38px_minmax(0,1fr)]";

export const PROVIDER_CONNECTION_DEFAULT_CLASS =
  "is-default bg-[color-mix(in_srgb,var(--accent)_4%,var(--surface))] before:absolute before:top-2.5 before:bottom-2.5 before:left-0 before:w-0.5 before:bg-[var(--accent)] before:content-['']";

export const PROVIDER_IDENTITY_MARK_CLASS =
  "provider-identity-mark grid size-8.5 place-items-center rounded-[4px] border border-[color-mix(in_srgb,var(--accent)_28%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_7%,var(--surface-raised))] font-[var(--font-mono)] text-[10px] font-bold tracking-[0.08em] text-[var(--accent)]";

export const PROVIDER_CONNECTION_COPY_CLASS =
  "provider-connection-copy grid min-w-0 gap-0.75";

export const PROVIDER_CONNECTION_TITLE_CLASS =
  "provider-connection-title flex items-center gap-2.25 [&_h3]:m-0 [&_h3]:font-[var(--font-display)] [&_h3]:text-[13px] [&_h3]:font-[650] [&_h3]:tracking-[-0.01em]";

export const PROVIDER_STATUS_LINE_CLASS =
  "provider-connection-status-line flex min-w-0 items-center gap-1.75 text-[var(--muted)] [&>span]:size-1.5 [&>span]:shrink-0 [&>span]:rounded-full [&>p]:m-0 [&>p]:truncate [&>p]:text-[length:var(--text-meta)]";

export const PROVIDER_FACTS_CLASS =
  "provider-connection-facts m-0 flex min-w-0 overflow-hidden text-[var(--muted)] max-[620px]:flex-wrap [&>div]:flex [&>div]:min-w-0 [&>div]:items-center [&>div+div]:before:px-1.5 [&>div+div]:before:text-[var(--line-strong)] [&>div+div]:before:content-['·'] [&_dd]:m-0 [&_dd]:max-w-[min(28vw,260px)] [&_dd]:truncate [&_dd]:text-[length:var(--text-meta)]";

export const PROVIDER_CONNECTION_ACTIONS_CLASS =
  "provider-connection-actions relative flex items-center justify-end gap-1.5 max-[860px]:col-start-2 max-[860px]:justify-start [&_button]:min-h-7";

export const PROVIDER_CONNECTION_MORE_CLASS =
  "provider-connection-more font-[var(--font-mono)] text-[9px] tracking-[1px] text-[var(--text-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--text)] focus-visible:bg-[var(--surface-raised)] focus-visible:text-[var(--text)] data-[state=open]:bg-[var(--surface-raised)] data-[state=open]:text-[var(--text)]";

export const PROVIDER_CONNECTION_MENU_CLASS =
  "provider-connection-menu min-w-34.5 [&_[role=menuitem]]:text-[length:var(--text-control)]";

export const PROVIDER_ROUTING_DISCLOSURE_CLASS =
  "provider-routing-disclosure overflow-hidden rounded-[5px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] pt-0 [&>summary]:flex [&>summary]:min-h-14.5 [&>summary]:cursor-pointer [&>summary]:list-none [&>summary]:items-center [&>summary]:justify-between [&>summary]:gap-4.5 [&>summary]:px-3.25 [&>summary]:py-2.25 [&>summary::-webkit-details-marker]:hidden [&>summary>span:first-child]:grid [&>summary>span:first-child]:gap-0.5 [&>summary_strong]:font-[var(--font-display)] [&>summary_strong]:text-sm [&>summary_small]:text-[var(--muted)] [&>summary_small]:text-[length:var(--text-meta)] [&>summary>span:last-child]:font-[var(--font-mono)] [&>summary>span:last-child]:text-[var(--accent)] [&>summary>span:last-child]:text-[length:var(--text-meta)] [&>summary>span:last-child]:uppercase";

export const PROVIDER_ROUTING_CONTENT_CLASS =
  "provider-routing-content border-[var(--line-subtle)] border-t p-2.5";

export const PROVIDER_POOL_STACK_CLASS =
  "provider-pool-stack grid items-start gap-2.5 min-[900px]:grid-cols-2";

export const PROVIDER_POOL_PANEL_CLASS =
  "provider-pool-panel overflow-hidden rounded-[5px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_94%,transparent)]";

export const PROVIDER_POOL_HEADER_CLASS =
  "provider-pool-panel__header grid grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-2.75 bg-[color-mix(in_srgb,var(--surface-raised)_54%,transparent)] px-3.25 py-2.75 max-[620px]:grid-cols-[38px_minmax(0,1fr)]";

export const PROVIDER_POOL_TITLE_CLASS =
  "provider-pool-panel__title grid gap-0.5 [&_h3]:m-0 [&_h3]:font-[var(--font-display)] [&_h3]:text-[13px] [&_h3]:font-[650] [&_h3]:tracking-[-0.01em] [&_p]:m-0 [&_p]:text-[length:var(--text-meta)] [&_p]:leading-[1.55] [&_p]:text-[var(--text-soft)]";

export const PROVIDER_POOL_HEADER_ACTIONS_CLASS =
  "provider-pool-header-actions flex items-center justify-end gap-1.5 [&_button]:min-h-6.75 [&_button]:px-2.25";

export const PROVIDER_POOL_BODY_CLASS = "provider-pool-body grid min-w-0";

export const PROVIDER_POOL_TOOLBAR_CLASS =
  "provider-pool-toolbar grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center justify-between gap-2.5 border-[var(--line-subtle)] border-b bg-[color-mix(in_srgb,var(--surface-soft)_76%,transparent)] px-3.25 py-2 max-[1180px]:grid-cols-1 max-[1180px]:items-start max-[1180px]:gap-3 max-[620px]:px-3.5";

export const PROVIDER_POOL_SUMMARY_CLASS =
  "provider-pool-summary m-0 flex shrink-0 items-center max-[620px]:w-full max-[620px]:justify-between [&>div]:flex [&>div]:min-w-17 [&>div]:items-baseline [&>div]:gap-1.5 [&>div]:border-[var(--line-subtle)] [&>div]:border-l [&>div]:px-2.5 max-[620px]:[&>div]:min-w-0 [&>div:first-child]:border-l-0 [&>div:first-child]:pl-0 [&_dt]:font-[var(--font-mono)] [&_dt]:text-[length:var(--text-meta)] [&_dt]:tracking-[0.08em] [&_dt]:text-[var(--muted)] [&_dt]:uppercase [&_dd]:m-0 [&_dd]:font-[var(--font-display)] [&_dd]:text-sm [&_dd]:font-[650] [&_dd]:text-[var(--text)]";

export const PROVIDER_POOL_ROUTING_CLASS =
  "provider-pool-routing flex min-w-0 items-center justify-end gap-1.5 max-[1180px]:w-full max-[1180px]:justify-start max-[860px]:flex-wrap max-[860px]:items-start [&_button[role=combobox]>span>div]:block [&>div.flex>span]:hidden [&_button[role=combobox]>span>div>span:last-child]:hidden";

export const PROVIDER_POOL_ROUTING_LABEL_CLASS =
  "provider-pool-routing__label font-[var(--font-mono)] text-[length:var(--text-meta)] tracking-[0.08em] text-[var(--muted)] uppercase";

export const PROVIDER_POOL_DIRECTORY_CLASS =
  "provider-pool-directory grid min-w-0 content-start gap-2 px-3.25 pt-2.5 pb-2.25";

export const PROVIDER_POOL_DIRECTORY_HEADER_CLASS =
  "provider-pool-directory__header flex items-center justify-between gap-2.5 min-[900px]:items-start max-[860px]:items-start max-[860px]:flex-col [&>div]:flex [&>div]:items-baseline [&>div]:gap-1.75 [&_h4]:m-0 [&_h4]:text-[length:var(--text-control)] [&_h4]:text-[var(--text)] [&>small]:text-right [&>small]:text-[var(--muted)] [&>small]:text-[length:var(--text-meta)] min-[900px]:[&>small]:max-w-45 max-[860px]:[&>small]:text-left";

export const PROVIDER_POOL_COUNT_CLASS =
  "provider-pool-count font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--muted)]";

export const PROVIDER_POOL_EMPTY_CLASS =
  "provider-pool-empty-copy m-0 px-0 pt-0.5 pb-1 text-[length:var(--text-meta)] text-[var(--muted)]";

export const PROVIDER_POOL_ACCOUNTS_CLASS =
  "provider-pool-accounts m-0 grid list-none gap-1.5 p-0 [&>li]:relative [&>li>.badge]:absolute [&>li>.badge]:top-2.5 [&>li>.badge]:right-2.5 [&>li>.badge]:z-1";

export const PROVIDER_POOL_ACCOUNT_CLASS =
  "provider-pool-account min-w-0 [&>div]:gap-1.25 [&>div]:border-[var(--line-subtle)] [&>div]:bg-[color-mix(in_srgb,var(--surface-raised)_70%,transparent)] [&>div]:px-2.5 [&>div]:py-2 [&_[class~=text-txt]]:text-[var(--text)] min-[900px]:[&>div>div:first-child>div:last-child]:flex-1 min-[900px]:[&>div>div:first-child>div:last-child]:basis-full min-[900px]:[&>div>div:first-child>div:last-child]:justify-end min-[900px]:[&>div>div:first-child>div:last-child]:border-[var(--line-subtle)] min-[900px]:[&>div>div:first-child>div:last-child]:border-t min-[900px]:[&>div>div:first-child>div:last-child]:pt-1.5";

export const PROVIDER_POOL_DIRECT_ACCOUNT_CLASS =
  "[&>div>div:first-child>div:last-child>button:nth-of-type(4)]:hidden";

export const PROVIDER_ACCOUNT_PREVIEWED_CLASS =
  "provider-account-previewed outline outline-1 outline-offset-2 outline-[color-mix(in_srgb,var(--good)_55%,transparent)]";

export const PROVIDER_IMPORT_DISCLOSURE_CLASS =
  "provider-import-disclosure border-[var(--line-subtle)] border-t [&>summary]:flex [&>summary]:min-h-8 [&>summary]:cursor-pointer [&>summary]:list-none [&>summary]:items-center [&>summary]:justify-between [&>summary]:gap-3 [&>summary]:px-px [&>summary]:pt-1.5 [&>summary]:pb-0.5 [&>summary]:text-[var(--text-soft)] [&>summary::-webkit-details-marker]:hidden [&>summary>span:first-child]:grid [&>summary>span:first-child]:gap-0.5 [&>summary_strong]:text-[length:var(--text-control)] [&>summary>span:last-child]:grid [&>summary>span:last-child]:size-5.5 [&>summary>span:last-child]:place-items-center [&>summary>span:last-child]:rounded-[3px] [&>summary>span:last-child]:border [&>summary>span:last-child]:border-[var(--line-subtle)] [&>summary>span:last-child]:text-[15px] [&>summary>span:last-child]:text-[var(--accent)] [&[open]>summary>span:last-child]:rotate-45";

export const PROVIDER_IMPORT_FORM_CLASS =
  "provider-import-form grid grid-cols-2 gap-2.25 px-0 pt-2 pb-0.5 max-[620px]:grid-cols-1 [&_.form-field]:grid [&_.form-field]:gap-1 [&_.form-field>span]:font-[var(--font-mono)] [&_.form-field>span]:text-[var(--muted)] [&_.form-field>span]:text-[length:var(--text-meta)] [&_.form-field>span]:tracking-[0.05em] [&_.form-field>span]:uppercase";

export const PROVIDER_IMPORT_ACTION_CLASS =
  "provider-import-action col-span-full flex items-center justify-between gap-4.5 max-[860px]:items-start max-[860px]:flex-col max-[620px]:col-span-1 [&_p]:m-0 [&_p]:max-w-155 [&_p]:text-[length:var(--text-meta)] [&_p]:leading-[1.55] [&_p]:text-[var(--text-soft)]";

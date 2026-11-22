export const PROVIDER_POOL_STACK_CLASS = "provider-pool-stack";

export const PROVIDER_POOL_PANEL_CLASS = "provider-pool-panel";

export const PROVIDER_POOL_HEADER_CLASS = "provider-pool-panel__header";

export const PROVIDER_POOL_TITLE_CLASS =
  "provider-pool-panel__title grid gap-0.5 [&_h3]:m-0 [&_h3]:font-[var(--font-display)] [&_h3]:text-[13px] [&_h3]:font-[650] [&_h3]:tracking-[-0.01em] [&_p]:m-0 [&_p]:text-[length:var(--text-meta)] [&_p]:leading-[1.55] [&_p]:text-[var(--text-soft)]";

export const PROVIDER_POOL_HEADER_ACTIONS_CLASS =
  "provider-pool-header-actions flex flex-wrap items-center justify-end gap-2 [&_button]:min-h-[var(--control-height)] [&_button]:px-3 max-[760px]:[&_button]:min-h-11";

export const PROVIDER_POOL_BODY_CLASS = "provider-pool-body grid min-w-0";

export const PROVIDER_POOL_TOOLBAR_CLASS = "provider-pool-toolbar";

export const PROVIDER_POOL_SUMMARY_CLASS =
  "provider-pool-summary m-0 flex shrink-0 items-center @max-[480px]/providers:w-full @max-[480px]/providers:justify-between [&>div]:flex [&>div]:min-w-17 [&>div]:items-baseline [&>div]:gap-1.5 [&>div]:border-[var(--line-subtle)] [&>div]:border-l [&>div]:px-2.5 @max-[480px]/providers:[&>div]:min-w-0 [&>div:first-child]:border-l-0 [&>div:first-child]:pl-0 [&_dt]:font-[var(--font-mono)] [&_dt]:text-[length:var(--text-meta)] [&_dt]:tracking-[0.08em] [&_dt]:text-[var(--muted)] [&_dt]:uppercase [&_dd]:m-0 [&_dd]:font-[var(--font-display)] [&_dd]:text-sm [&_dd]:font-[650] [&_dd]:text-[var(--text)]";

export const PROVIDER_POOL_ROUTING_CLASS =
  "provider-pool-routing flex min-w-0 items-center justify-end gap-1.5 @max-[900px]/providers:w-full @max-[900px]/providers:justify-start @max-[680px]/providers:flex-wrap @max-[680px]/providers:items-start [&_button[role=combobox]>span>div]:block [&>div.flex>span]:hidden [&_button[role=combobox]>span>div>span:last-child]:hidden";

export const PROVIDER_POOL_ROUTING_LABEL_CLASS =
  "provider-pool-routing__label font-[var(--font-mono)] text-[length:var(--text-meta)] tracking-[0.08em] text-[var(--muted)] uppercase";

export const PROVIDER_POOL_DIRECTORY_CLASS =
  "provider-pool-directory grid min-w-0 content-start gap-2 px-3.25 pt-2.5 pb-2.25";

export const PROVIDER_POOL_DIRECTORY_HEADER_CLASS =
  "provider-pool-directory__header flex items-center justify-between gap-2.5 @min-[900px]/providers:items-start @max-[680px]/providers:items-start @max-[680px]/providers:flex-col [&>div]:flex [&>div]:items-baseline [&>div]:gap-1.75 [&_h4]:m-0 [&_h4]:text-[length:var(--text-control)] [&_h4]:text-[var(--text)] [&>small]:text-right [&>small]:text-[var(--muted)] [&>small]:text-[length:var(--text-meta)] @min-[900px]/providers:[&>small]:max-w-45 @max-[680px]/providers:[&>small]:text-left";

export const PROVIDER_POOL_COUNT_CLASS =
  "provider-pool-count font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--muted)]";

export const PROVIDER_POOL_EMPTY_CLASS =
  "provider-pool-empty-copy m-0 px-0 pt-0.5 pb-1 text-[length:var(--text-meta)] text-[var(--muted)]";

export const PROVIDER_POOL_ACCOUNTS_CLASS =
  "provider-pool-accounts m-0 grid list-none gap-1.5 p-0 [&>li]:relative [&>li>.badge]:absolute [&>li>.badge]:top-2.5 [&>li>.badge]:right-2.5 [&>li>.badge]:z-1";

export const PROVIDER_POOL_ACCOUNT_CLASS =
  "provider-pool-account min-w-0 [&>div]:gap-1.25 [&>div]:border-[var(--line-subtle)] [&>div]:bg-[color-mix(in_srgb,var(--surface-raised)_70%,transparent)] [&>div]:px-2.5 [&>div]:py-2 [&_[class~=text-txt]]:text-[var(--text)] @min-[900px]/providers:[&>div>div:first-child>div:last-child]:flex-1 @min-[900px]/providers:[&>div>div:first-child>div:last-child]:basis-full @min-[900px]/providers:[&>div>div:first-child>div:last-child]:justify-end @min-[900px]/providers:[&>div>div:first-child>div:last-child]:border-[var(--line-subtle)] @min-[900px]/providers:[&>div>div:first-child>div:last-child]:border-t @min-[900px]/providers:[&>div>div:first-child>div:last-child]:pt-1.5";

export const PROVIDER_POOL_DIRECT_ACCOUNT_CLASS =
  "[&>div>div:first-child>div:last-child>button:nth-of-type(4)]:hidden";

export const PROVIDER_ACCOUNT_PREVIEWED_CLASS =
  "provider-account-previewed outline outline-1 outline-offset-2 outline-[color-mix(in_srgb,var(--good)_55%,transparent)]";

export const PROVIDER_IMPORT_DISCLOSURE_CLASS =
  "provider-import-disclosure border-[var(--line-subtle)] border-t [&>summary]:flex [&>summary]:min-h-8 [&>summary]:cursor-pointer [&>summary]:list-none [&>summary]:items-center [&>summary]:justify-between [&>summary]:gap-3 [&>summary]:px-px [&>summary]:pt-1.5 [&>summary]:pb-0.5 [&>summary]:text-[var(--text-soft)] [&>summary::-webkit-details-marker]:hidden [&>summary>span:first-child]:grid [&>summary>span:first-child]:gap-0.5 [&>summary_strong]:text-[length:var(--text-control)] [&>summary>span:last-child]:grid [&>summary>span:last-child]:size-5.5 [&>summary>span:last-child]:place-items-center [&>summary>span:last-child]:rounded-[3px] [&>summary>span:last-child]:border [&>summary>span:last-child]:border-[var(--line-subtle)] [&>summary>span:last-child]:text-[15px] [&>summary>span:last-child]:text-[var(--accent-text)] [&[open]>summary>span:last-child]:rotate-45";

export const PROVIDER_IMPORT_FORM_CLASS =
  "provider-import-form grid grid-cols-2 gap-4 px-0 pt-4 pb-2 @max-[480px]/providers:grid-cols-1 [&_.form-field]:grid [&_.form-field]:gap-2 [&_.form-field>span]:font-medium [&_.form-field>span]:text-[var(--text-soft)] [&_.form-field>span]:text-[length:var(--text-control)]";

export const PROVIDER_IMPORT_ACTION_CLASS =
  "provider-import-action col-span-full flex items-center justify-between gap-4.5 @max-[680px]/providers:items-start @max-[680px]/providers:flex-col @max-[480px]/providers:col-span-1 [&_p]:m-0 [&_p]:max-w-155 [&_p]:text-[length:var(--text-meta)] [&_p]:leading-[1.55] [&_p]:text-[var(--text-soft)]";

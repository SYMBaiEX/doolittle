import "./catalog-browser.css";

export const CATALOG_BROWSER_CLASS = "catalog-browser";
export const CATALOG_INDEX_CLASS =
  "catalog-browser-index grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto]";
export const CATALOG_INDEX_HEADER_CLASS =
  "flex min-h-11 items-center justify-between gap-3 px-3 py-2 [&>div]:grid [&>div]:gap-px [&_small]:text-[length:var(--text-meta)] [&_small]:text-[var(--muted)] [&_strong]:text-[length:var(--text-control)] [&_strong]:text-[var(--text)]";
export const CATALOG_EYEBROW_CLASS =
  "text-[length:var(--text-control)] font-medium text-[var(--muted)]";
export const CATALOG_INDEX_LIST_CLASS =
  "m-0 grid min-h-0 list-none content-start gap-0.5 overflow-y-auto px-1.5 [scrollbar-gutter:stable]";
export const CATALOG_INDEX_TITLE_CLASS =
  "flex min-w-0 items-center justify-between gap-[7px] [&_strong]:overflow-hidden [&_strong]:text-ellipsis [&_strong]:whitespace-nowrap [&_strong]:text-[length:var(--text-control)]";
export const CATALOG_INDEX_META_CLASS =
  "flex min-w-0 items-center gap-2 text-[length:var(--text-meta)] text-[var(--muted)] [&>*]:overflow-hidden [&>*]:text-ellipsis [&>*]:whitespace-nowrap";
export const CATALOG_INDEX_FOOTER_CLASS =
  "flex min-h-11 items-center justify-between gap-2 px-3 py-1.5 [&>span]:text-[length:var(--text-meta)] [&>span]:text-[var(--muted)]";
export const CATALOG_DETAIL_CLASS =
  "catalog-browser-detail min-h-0 min-w-0 overflow-auto bg-[var(--bg)]";
export const CATALOG_DETAIL_HEADER_CLASS =
  "flex items-start justify-between gap-[18px] pb-2 max-[520px]:flex-col max-[520px]:gap-[9px] [&>div]:min-w-0 [&_h2]:mt-[5px] [&_h2]:mb-1.5 [&_h2]:font-[var(--font-display)] [&_h2]:text-[clamp(14px,1.1vw,17px)] [&_h2]:font-semibold [&_h2]:leading-[1.18] [&_h2]:tracking-[-0.015em] [&_p]:m-0 [&_p]:max-w-[760px] [&_p]:text-[length:var(--text-body)] [&_p]:leading-[1.58] [&_p]:text-[var(--text-soft)]";
export const CATALOG_CALLOUT_CLASS =
  "mt-3 grid gap-1 rounded-[var(--radius-sm)] bg-[var(--warn-soft)] px-3 py-2 text-[length:var(--text-meta)] text-[var(--text-soft)] [&_strong]:text-[var(--warn)]";
export const CATALOG_FACTS_CLASS =
  "mt-4 grid gap-y-3 [&>div]:grid [&>div]:min-w-0 [&>div]:grid-cols-[104px_minmax(0,1fr)] [&>div]:gap-3 max-[520px]:[&>div]:grid-cols-[minmax(72px,0.35fr)_minmax(0,1fr)] [&_dd]:m-0 [&_dd]:min-w-0 [&_dd]:text-[length:var(--text-control)] [&_dd]:text-[var(--text-soft)] [&_dd]:[overflow-wrap:anywhere] [&_dt]:text-[length:var(--text-meta)] [&_dt]:text-[var(--muted)] [&_dt]:[overflow-wrap:anywhere]";
export const CATALOG_TOKENS_CLASS =
  "mt-4 grid gap-2 [&>div]:flex [&>div]:flex-wrap [&>div]:gap-1 [&_code]:rounded-[var(--radius-xs)] [&_code]:bg-[var(--surface-soft)] [&_code]:px-1.5 [&_code]:py-1 [&_code]:text-[length:var(--text-meta)] [&_code]:text-[var(--text-soft)] [&_code]:[overflow-wrap:anywhere]";

export function catalogIndexItemClass(active: boolean): string {
  return `catalog-browser-item grid min-h-12 w-full gap-0.5 rounded-[var(--radius-sm)] border-0 bg-transparent px-2 py-2 text-left ${
    active
      ? "font-semibold [&_strong]:font-semibold text-[var(--text)]"
      : "[&_strong]:font-medium text-[var(--text-soft)] hover:text-[var(--text)]"
  }`;
}

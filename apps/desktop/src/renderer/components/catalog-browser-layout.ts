export const CATALOG_BROWSER_CLASS =
  "grid min-h-[clamp(360px,48vh,560px)] grid-cols-[minmax(250px,0.58fr)_minmax(0,1.42fr)] overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_94%,transparent)] max-[820px]:grid-cols-1";
export const CATALOG_INDEX_CLASS =
  "grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] border-r border-[var(--border)] max-[820px]:max-h-[310px] max-[820px]:border-r-0 max-[820px]:border-b";
export const CATALOG_INDEX_HEADER_CLASS =
  "flex min-h-[51px] items-center justify-between gap-3 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--surface-soft)_70%,transparent)] px-2.5 py-2 [&>div]:grid [&>div]:gap-px [&_small]:font-[var(--font-mono)] [&_small]:text-[length:var(--text-meta)] [&_small]:text-[var(--muted)] [&_strong]:text-[length:var(--text-control)] [&_strong]:text-[var(--text)]";
export const CATALOG_EYEBROW_CLASS =
  "font-[var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]";
export const CATALOG_INDEX_LIST_CLASS =
  "m-0 grid min-h-0 list-none content-start gap-px overflow-y-auto p-1 [scrollbar-gutter:stable]";
export const CATALOG_INDEX_TITLE_CLASS =
  "flex min-w-0 items-center justify-between gap-[7px] [&_strong]:overflow-hidden [&_strong]:text-ellipsis [&_strong]:whitespace-nowrap [&_strong]:text-[length:var(--text-control)]";
export const CATALOG_INDEX_META_CLASS =
  "flex min-w-0 items-center gap-[7px] font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--muted)] [&>*]:overflow-hidden [&>*]:text-ellipsis [&>*]:whitespace-nowrap [&>:not(:last-child)]:after:ml-[7px] [&>:not(:last-child)]:after:text-[var(--faint)] [&>:not(:last-child)]:after:content-['·']";
export const CATALOG_INDEX_FOOTER_CLASS =
  "flex min-h-[42px] items-center justify-between gap-2.5 border-t border-[var(--border)] bg-[color-mix(in_srgb,var(--surface-soft)_66%,transparent)] px-2 py-1.5 [&>span]:font-[var(--font-mono)] [&>span]:text-[length:var(--text-meta)] [&>span]:text-[var(--muted)]";
export const CATALOG_DETAIL_CLASS =
  "min-h-0 min-w-0 overflow-auto bg-[color-mix(in_srgb,var(--bg)_90%,transparent)] px-4 pt-4 pb-4 max-[820px]:min-h-[310px] max-[520px]:px-3 max-[520px]:pt-3 max-[520px]:pb-4";
export const CATALOG_DETAIL_HEADER_CLASS =
  "flex items-start justify-between gap-[18px] pb-2 max-[520px]:flex-col max-[520px]:gap-[9px] [&>div]:min-w-0 [&_h2]:mt-[5px] [&_h2]:mb-1.5 [&_h2]:font-[var(--font-display)] [&_h2]:text-[clamp(14px,1.1vw,17px)] [&_h2]:font-semibold [&_h2]:leading-[1.18] [&_h2]:tracking-[-0.015em] [&_p]:m-0 [&_p]:max-w-[760px] [&_p]:text-[length:var(--text-body)] [&_p]:leading-[1.58] [&_p]:text-[var(--text-soft)]";
export const CATALOG_CALLOUT_CLASS =
  "mt-3 grid gap-0.5 border-l-2 border-[var(--warn)] bg-[var(--warn-soft)] px-[11px] py-[9px] text-[length:var(--text-meta)] text-[var(--text-soft)] [&_strong]:font-[var(--font-mono)] [&_strong]:uppercase [&_strong]:text-[var(--warn)]";
export const CATALOG_FACTS_CLASS =
  "mt-3.5 grid border-t border-[var(--border)] [&>div]:grid [&>div]:min-w-0 [&>div]:grid-cols-[104px_minmax(0,1fr)] [&>div]:gap-3.5 [&>div]:border-b [&>div]:border-[var(--border)] [&>div]:py-2 max-[520px]:[&>div]:grid-cols-[82px_minmax(0,1fr)] max-[520px]:[&>div]:gap-[9px] [&_dd]:m-0 [&_dd]:min-w-0 [&_dd]:text-[length:var(--text-control)] [&_dd]:text-[var(--text-soft)] [&_dd]:[overflow-wrap:anywhere] [&_dt]:font-[var(--font-mono)] [&_dt]:text-[length:var(--text-meta)] [&_dt]:uppercase [&_dt]:text-[var(--muted)]";
export const CATALOG_TOKENS_CLASS =
  "mt-[17px] grid gap-[7px] [&>div]:flex [&>div]:flex-wrap [&>div]:gap-[5px] [&_code]:rounded-[var(--radius-xs)] [&_code]:border [&_code]:border-[var(--border)] [&_code]:bg-[var(--surface-soft)] [&_code]:px-1.5 [&_code]:py-1 [&_code]:text-[length:var(--text-meta)] [&_code]:text-[var(--text-soft)]";

export function catalogIndexItemClass(active: boolean): string {
  return `grid min-h-[49px] w-full gap-[3px] rounded-[var(--radius-xs)] border p-[6px_8px] text-left ${
    active
      ? "border-[color-mix(in_srgb,var(--accent)_20%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface-soft))] text-[var(--text)] shadow-[inset_2px_0_var(--accent)]"
      : "border-transparent bg-transparent text-[var(--text-soft)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
  }`;
}

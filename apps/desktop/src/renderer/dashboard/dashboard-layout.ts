export const DASHBOARD_PAGE_CLASS =
  "page mx-auto grid w-[min(100%,1320px)] gap-2.5";

export const DASHBOARD_CARD_CLASS =
  "min-w-0 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-3.5";

export const DASHBOARD_CARD_HEADING_CLASS =
  "mb-3 flex min-h-9 items-center justify-between gap-4 [&>div]:min-w-0 [&>div]:first:grid [&>div]:first:gap-0.5 [&_h2]:m-0 [&_h2]:font-[var(--font-display)] [&_h2]:text-sm [&_small]:overflow-hidden [&_small]:text-ellipsis [&_small]:whitespace-nowrap [&_small]:text-[var(--muted)]";

export const DASHBOARD_TWO_COLUMN_CLASS =
  "grid grid-cols-[minmax(0,1.02fr)_minmax(20rem,0.98fr)] items-start gap-2.5 max-[980px]:grid-cols-1";

export const DASHBOARD_MINI_GRID_CLASS =
  "grid grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] items-start gap-2.5 max-[980px]:grid-cols-1";

export const DASHBOARD_STATUS_ROW_CLASS =
  "flex min-h-[42px] w-full items-center justify-between gap-4 rounded-[var(--radius-xs)] px-1 py-[7px] text-left [&>div]:grid [&>div]:min-w-0 [&>div]:gap-[3px] [&_small]:overflow-hidden [&_small]:text-ellipsis [&_small]:text-[length:var(--text-meta)] [&_small]:text-[var(--muted)]";

export const DASHBOARD_DISCLOSURE_CLASS =
  "group overflow-hidden rounded border border-[var(--border)] bg-[var(--surface)]";

export const DASHBOARD_SUMMARY_CLASS =
  "flex min-h-[50px] cursor-pointer list-none items-center justify-between gap-[18px] px-3.5 py-2.5 text-[var(--text)] group-open:bg-[var(--surface-soft)] [&::-webkit-details-marker]:hidden";

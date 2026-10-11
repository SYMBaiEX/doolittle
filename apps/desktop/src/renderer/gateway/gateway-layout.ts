export const GATEWAY_PAGE_CLASS = "page @container/gateway min-w-0 gap-5";

export const GATEWAY_LAYOUT_CLASS = "grid grid-cols-1 items-start gap-2.5";

export const GATEWAY_SECONDARY_GRID_CLASS =
  "grid grid-cols-2 items-start gap-5 @max-[760px]/gateway:grid-cols-1 [&>.panel]:min-w-0 [&>.panel]:border-t [&>.panel]:border-[var(--border)] [&>.panel]:bg-transparent";

export const GATEWAY_DISCLOSURE_SUMMARY_CLASS =
  "relative flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 py-1.5 pr-8 pl-3 [&::-webkit-details-marker]:hidden";

export const GATEWAY_META_CLASS =
  "font-mono text-[length:var(--text-meta)] text-[var(--muted)]";

export const GATEWAY_FILTER_CONTROL_CLASS =
  "min-h-10 w-full min-w-0 rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[length:var(--text-control)] text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] max-[760px]:min-h-11";

export const GATEWAY_HISTORY_STATE_CLASS =
  "grid min-h-14.5 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.75 border-[var(--border)] border-t px-3 py-2.5 max-[620px]:grid-cols-[auto_minmax(0,1fr)]";

export const GATEWAY_TIMELINE_CLASS = "m-0 grid list-none gap-0 p-0";

export const GATEWAY_ENTRY_CLASS =
  "grid gap-1.5 border-[var(--border)] border-b py-2.75 last:border-b-0";

export const GATEWAY_LIST_CLASS = "m-0 grid list-none gap-0 p-0";

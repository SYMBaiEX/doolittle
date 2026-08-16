export const SESSIONS_PAGE_CLASS =
  "page flex h-full min-h-0 w-full max-w-none flex-col overflow-hidden";

export const SESSIONS_WORKSPACE_CLASS =
  "grid min-h-0 flex-1 grid-cols-[clamp(250px,24vw,320px)_minmax(0,1fr)] overflow-hidden max-[760px]:grid-cols-1";

export const SESSION_LIST_PANEL_CLASS =
  "flex min-h-0 flex-col overflow-hidden border-r border-[var(--border)] p-2 max-[760px]:max-h-[42vh] max-[760px]:border-r-0 max-[760px]:border-b";

export const SESSION_ROW_CLASS =
  "grid min-h-[46px] w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[var(--radius-xs)] border border-transparent p-2 text-left text-[var(--text)] hover:border-[var(--border)] hover:bg-[var(--surface-raised)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)]";

export const SESSION_ROW_SELECTED_CLASS =
  "border-[var(--accent-border)] bg-[color-mix(in_srgb,var(--accent)_9%,var(--surface))]";

export const SESSION_DETAIL_CLASS = "mx-auto w-[min(100%,1080px)] pb-[18px]";

export const SESSION_DETAIL_TOOLBAR_CLASS =
  "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3.5 pb-[9px] max-[860px]:grid-cols-1 [&_h2]:m-0";

export const SESSION_INSIGHT_GRID_CLASS =
  "my-1.5 grid grid-cols-2 gap-1.5 max-[860px]:grid-cols-1";

export const SESSION_DISCLOSURE_CLASS =
  "group min-w-0 overflow-hidden rounded-[3px] border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--surface-raised)_72%,transparent)]";

export const SESSION_DISCLOSURE_SUMMARY_CLASS =
  "flex min-h-[38px] cursor-pointer list-none items-center justify-between gap-2.5 px-2 py-[5px] group-open:border-b group-open:border-[var(--border-subtle)] [&::-webkit-details-marker]:hidden";

export const SESSION_STATUS_ROW_CLASS =
  "flex min-h-[42px] w-full items-center justify-between gap-4 border-b border-[var(--border-subtle)] py-[7px] text-left last:border-b-0 [&>div]:grid [&>div]:min-w-0 [&>div]:gap-[3px] [&_strong]:text-[length:var(--text-control)] [&_strong]:text-[var(--text-strong)] [&_small]:break-words [&_small]:text-[length:var(--text-meta)] [&_small]:text-[var(--text-muted)]";

export const SESSION_TRANSCRIPT_PANEL_CLASS =
  "mt-2 overflow-hidden rounded border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--surface-raised)_68%,transparent)]";

export const SESSION_TRANSCRIPT_HEADER_CLASS =
  "flex items-baseline justify-between gap-3 border-b border-[var(--border-subtle)] px-3 py-2 max-[860px]:flex-col max-[860px]:items-start [&>span]:grid [&_strong]:text-[11px] [&_strong]:text-[var(--text-strong)] [&_small]:text-[10px] [&_small]:text-[var(--text-muted)]";

export const SESSION_TRANSCRIPT_MESSAGE_CLASS =
  "m-0 w-[min(100%,720px)] rounded-[3px] border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--surface)_64%,transparent)] px-2.5 py-2 [&_.message-content]:text-xs [&_.message-content]:leading-[1.6]";

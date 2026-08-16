export const MEDIA_TAB_PANEL_CLASS =
  "grid min-h-0 min-w-0 grid-cols-[minmax(300px,0.85fr)_minmax(360px,1.15fr)] items-start gap-3 max-[760px]:grid-cols-1 [&[hidden]]:hidden [&>:only-child]:col-span-full [&>:only-child]:w-[min(100%,960px)]";

export const MEDIA_FORM_CLASS =
  "grid min-h-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,180px),1fr))] content-start gap-x-2.5 gap-y-0 rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[color-mix(in_srgb,var(--surface-raised)_82%,var(--surface))] p-[var(--card-pad)] focus-within:border-[color-mix(in_srgb,var(--accent)_24%,var(--border))]";

export const MEDIA_HEADING_CLASS =
  "col-span-full mb-[7px] flex min-h-6 items-center justify-between gap-4 [&>div]:min-w-0 [&_h2]:m-0 [&_h2]:font-[var(--font-display)] [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:leading-[1.2] [&_h2]:tracking-[-0.015em]";

export const MEDIA_FIELD_CLASS =
  "mb-[11px] grid gap-[5px] font-[var(--font-mono)] text-[length:var(--text-meta)] tracking-[0.06em] text-[var(--muted)] uppercase";

export const MEDIA_FIELD_WIDE_CLASS = `${MEDIA_FIELD_CLASS} col-span-full`;

export const MEDIA_FILE_FIELD_CLASS =
  "col-span-full mb-[11px] grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 max-[620px]:grid-cols-1 [&>label]:mb-0 [&>label]:min-w-0 [&>button]:min-h-[34px] [&>button]:px-3.5 max-[620px]:[&>button]:w-full";

export const MEDIA_ACTIONS_CLASS =
  "col-span-full mt-3 flex items-center justify-end gap-2 border-t border-[var(--border)] pt-2.5";

export const MEDIA_SELECT_CLASS =
  "h-10 w-full rounded-sm border border-input bg-bg px-3 py-2 font-sans text-sm tracking-normal normal-case transition-[border-color,box-shadow,background-color] disabled:cursor-not-allowed disabled:opacity-50";

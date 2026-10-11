export const MEMORY_GRID_CLASS =
  "grid grid-cols-2 items-start gap-5 max-[760px]:grid-cols-1 @max-[680px]/memory:grid-cols-1";

export const MEMORY_CARD_CLASS =
  "min-w-0 border-t border-[var(--line-subtle)] bg-transparent py-4";

export const MEMORY_HEADING_CLASS =
  "mb-[calc(var(--page-gap)-2px)] flex min-h-[34px] items-center justify-between gap-4 [&>div]:min-w-0 [&_h2]:mt-1 [&_h2]:font-[var(--font-display)] [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:leading-[1.2] [&_h2]:tracking-[-0.015em]";

export const MEMORY_PREVIEW_CLASS =
  "m-0 max-h-[360px] max-w-full overflow-auto rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-soft)] p-4 text-[length:var(--text-control)] leading-[1.55] whitespace-pre-wrap text-[var(--text-soft)] [overflow-wrap:anywhere] [scrollbar-gutter:stable]";

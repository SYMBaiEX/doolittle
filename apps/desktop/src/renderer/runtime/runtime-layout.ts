export const RUNTIME_PAGE_CLASS =
  "mx-auto flex min-h-full w-[min(100%,1420px)] flex-col gap-2.5 px-[clamp(24px,4vw,58px)] pt-[34px] pb-[54px] [&_.page-header]:min-h-[74px] [&_.page-header]:pb-3";

export const RUNTIME_SECTION_STACK_CLASS = "grid min-h-0 gap-2.5";

export const RUNTIME_TWO_COLUMN_GRID_CLASS =
  "grid grid-cols-2 items-start gap-2.5 max-[760px]:grid-cols-1";

export const RUNTIME_INVENTORY_GRID_CLASS =
  "grid grid-cols-2 items-start gap-2.5 max-[760px]:grid-cols-1 min-[761px]:max-[1080px]:[&>:last-child]:col-span-full";

export const RUNTIME_CARD_CLASS =
  "min-w-0 rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[color-mix(in_srgb,var(--surface-raised)_82%,var(--surface))] px-3 py-[11px] shadow-none focus-within:border-[color-mix(in_srgb,var(--accent)_24%,var(--border))]";

export const RUNTIME_CARD_HEADING_CLASS =
  "mb-2.5 flex min-h-[34px] items-center justify-between gap-4 [&>div]:min-w-0 [&_h2]:mt-1 [&_h2]:mb-0 [&_h2]:font-[var(--font-display)] [&_h2]:text-base [&_h2]:font-semibold [&_h2]:leading-[1.2] [&_h2]:tracking-[-0.015em]";

export const RUNTIME_STATUS_ROW_CLASS =
  "flex min-h-[42px] items-center justify-between gap-[15px] border-b border-[var(--line-subtle)] py-[7px] last:border-b-0 [&>div]:flex [&>div]:min-w-0 [&>div]:max-w-full [&>div]:flex-col [&>div]:gap-[3px] [&_strong]:text-[var(--text-control)] [&_strong]:break-words [&_small]:text-[var(--text-meta)] [&_small]:leading-[1.4] [&_small]:break-words [&_small]:text-[var(--muted)]";

export const RUNTIME_COMPACT_LIST_CLASS =
  "grid gap-0 border-t border-[var(--line-subtle)]";

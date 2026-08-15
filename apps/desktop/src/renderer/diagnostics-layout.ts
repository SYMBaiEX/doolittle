export const DIAGNOSTICS_PAGE_GRID_CLASS =
  "grid grid-cols-2 items-start gap-3 max-[760px]:grid-cols-1";

export const DIAGNOSTICS_CARD_CLASS =
  "min-w-0 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-[var(--card-pad)]";

export const DIAGNOSTICS_CARD_HEADING_CLASS =
  "mb-3 flex min-h-9 items-center justify-between gap-4 [&>div]:min-w-0 [&_h2]:mt-1 [&_h2]:mb-0 [&_h2]:font-[var(--font-display)] [&_h2]:text-base [&_h2]:font-semibold";

export const DIAGNOSTICS_STATUS_ROW_CLASS =
  "flex min-h-[42px] items-center justify-between gap-4 border-b border-[var(--border)] py-[7px] last:border-b-0 [&>div]:grid [&>div]:min-w-0 [&>div]:gap-[3px] [&_strong]:text-[var(--text-control)] [&_small]:text-[var(--text-meta)] [&_small]:leading-[1.4] [&_small]:text-[var(--muted)]";

export const DIAGNOSTICS_DETAILS_CLASS =
  "group overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)]";

export const DIAGNOSTICS_SUMMARY_CLASS =
  "flex min-h-[46px] cursor-pointer list-none items-center gap-3 px-[var(--card-pad)] py-2.5 text-[var(--text-soft)] [&::-webkit-details-marker]:hidden";

export const DIAGNOSTICS_CHEVRON_CLASS =
  "inline-block text-[var(--accent)] transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none";

export const DIAGNOSTICS_IDLE_CLASS =
  "grid gap-[3px] pt-3 pb-1 [&_strong]:text-[var(--text-control)] [&_strong]:text-[var(--text-soft)] [&_small]:max-w-[52ch] [&_small]:text-[var(--text-meta)] [&_small]:leading-[1.45] [&_small]:text-[var(--muted)]";

export const COMPATIBILITY_EMPTY_CLASS =
  "grid min-h-[52px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_82%,transparent)] px-[11px] py-2 max-[700px]:grid-cols-[auto_minmax(0,1fr)]";

export const SETUP_READINESS_CLASS =
  "setup-readiness relative grid gap-[7px] overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-[15px] pt-3.5 pb-[13px]";

export const SETUP_READINESS_HEADING_CLASS =
  "flex items-start justify-between gap-5 max-[700px]:gap-2.5 [&>div]:grid [&>div]:min-w-0 [&>div]:gap-0.5 [&_h2]:m-0 [&_h2]:font-[var(--font-display)] [&_h2]:text-[clamp(18px,2vw,22px)] [&_h2]:leading-[1.08] [&_h2]:tracking-[-0.035em]";

export function setupReadinessSignalClass(
  tone: "neutral" | "good" | "warn" | "bad",
): string {
  if (tone === "good") return "bg-[var(--good)]";
  if (tone === "warn") return "bg-[var(--warn)]";
  if (tone === "bad") return "bg-[var(--bad)]";
  return "bg-[var(--border-strong)]";
}

export const SETUP_ACCOUNT_BAR_CLASS =
  "flex min-h-11 items-center justify-between gap-[18px] rounded border border-[var(--border)] bg-[var(--surface)] px-[11px] py-[7px] max-[700px]:flex-col max-[700px]:items-stretch";

export const SETUP_GUIDANCE_BODY_CLASS =
  "border-t border-[var(--border)] px-[var(--card-pad)] pb-[var(--card-pad)]";

export const SETUP_GUIDANCE_TOOLBAR_CLASS =
  "flex items-center justify-between gap-4 py-2.5 max-[700px]:flex-col max-[700px]:items-stretch [&_p]:m-0 [&_p]:text-[var(--text-meta)] [&_p]:text-[var(--muted)]";

export const SETUP_GUIDANCE_LIST_CLASS = "m-0 grid list-none p-0";

export const SETUP_GUIDANCE_ITEM_CLASS =
  "grid min-h-[42px] grid-cols-[24px_minmax(0,1fr)_auto] items-start gap-[9px] border-t border-[var(--border)] py-[9px] text-[var(--text-control)] leading-[1.45] text-[var(--text-soft)]";

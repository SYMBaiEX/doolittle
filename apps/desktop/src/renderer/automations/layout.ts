export const AUTOMATION_PAGE_CLASS =
  "page automation-page gap-3 [--automation-line:color-mix(in_srgb,var(--accent)_28%,var(--border))]";

export const AUTOMATION_BUILDER_CLASS =
  "automation-builder overflow-hidden rounded-[var(--radius-md)] border border-[var(--automation-line)] bg-[var(--surface)]";

export const AUTOMATION_BUILDER_HEADER_CLASS =
  "automation-builder__header grid grid-cols-[minmax(0,1fr)_minmax(220px,0.55fr)] items-end gap-5 border-[var(--automation-line)] border-b px-5 py-4 max-[720px]:grid-cols-1 [&_h2]:mt-1 [&_h2]:mb-0 [&_h2]:font-[var(--font-display)] [&_h2]:text-lg [&_h2]:tracking-[-0.025em]";

export const AUTOMATION_FIELD_LABEL_CLASS =
  "grid min-w-0 gap-1.5 text-[11px] font-semibold tracking-[0.06em] text-[var(--muted)] uppercase";

export const AUTOMATION_FIELD_CONTROL_CLASS =
  "min-h-9 w-full rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--surface-raised)] px-2.5 py-2 text-[13px] text-[var(--text)]";

export const AUTOMATION_BUILDER_GRID_CLASS =
  "automation-builder__grid grid grid-cols-3 gap-0 border-[var(--border)] border-t max-[1040px]:grid-cols-1";

export const AUTOMATION_BUILDER_SECTION_CLASS =
  "automation-builder__section grid content-start gap-3 border-[var(--border)] border-r p-4 last:border-r-0 max-[1040px]:border-r-0 max-[1040px]:border-b max-[1040px]:last:border-b-0";

export const AUTOMATION_SECTION_HEADING_CLASS =
  "automation-builder__section-heading flex items-start justify-between gap-3 [&_strong]:text-sm [&_small]:text-[10px] [&_small]:text-[var(--muted)]";

export const AUTOMATION_CHOICE_GRID_CLASS =
  "automation-choice-grid grid grid-cols-3 gap-1 rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--surface-soft)] p-1";

export const AUTOMATION_CHOICE_BUTTON_CLASS =
  "min-h-8 rounded-[calc(var(--radius-xs)-1px)] px-2 py-1.5 text-[11px] font-semibold text-[var(--muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)]";

export const AUTOMATION_CHOICE_SELECTED_CLASS =
  "selected bg-[var(--accent-soft)] text-[var(--accent)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_34%,var(--border))]";

export const AUTOMATION_BUILDER_FOOTER_CLASS =
  "automation-builder__footer flex items-center justify-between gap-4 border-[var(--automation-line)] border-t px-5 py-3.5 max-[720px]:items-stretch max-[720px]:flex-col [&>span]:text-[11px] [&>span]:text-[var(--muted)]";

export const AUTOMATION_WORKSPACE_CLASS =
  "automation-workspace grid grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] items-start gap-3 max-[1040px]:grid-cols-1";

export const AUTOMATION_JOB_CARD_CLASS =
  "automation-job-card rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-raised)] p-3.5 transition-colors hover:border-[var(--border-strong)]";

export const AUTOMATION_JOB_SUMMARY_CLASS =
  "automation-job-summary my-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-[var(--radius-xs)] bg-[var(--surface-soft)] p-2.5 max-[620px]:grid-cols-1";

export const AUTOMATION_DETAILS_SUMMARY_CLASS =
  "flex min-h-8 cursor-pointer list-none items-center justify-between border-[var(--border)] border-t pt-2.5 text-[11px] font-semibold text-[var(--muted)] [&::-webkit-details-marker]:hidden after:text-[var(--faint)] after:content-['+'] [details[open]_&]:after:content-['−']";

export const AUTOMATION_RUNS_PANEL_CLASS =
  "automation-runs-panel overflow-hidden [&[open]>summary]:border-b [&[open]>summary]:border-[var(--border)] [&>summary]:flex [&>summary]:min-h-14 [&>summary]:cursor-pointer [&>summary]:list-none [&>summary]:items-center [&>summary]:justify-between [&>summary]:gap-3 [&>summary]:px-4 [&>summary]:py-3 [&>summary::-webkit-details-marker]:hidden [&>summary>span:first-child]:grid [&>summary>span:first-child]:gap-0.5 [&>summary_small]:text-[10px] [&>summary_small]:text-[var(--muted)]";

export const AUTOMATION_RUN_BUTTON_CLASS =
  "grid min-h-12 w-full grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[var(--radius-xs)] px-2.5 py-2 text-left transition-colors hover:bg-[var(--surface-hover)]";

export const AUTOMATION_TRACE_CLASS =
  "automation-trace rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-raised)] p-3.5";

export const AUTOMATION_STATUS_DOT_CLASS =
  "automation-run-status size-2 rounded-full bg-[var(--good)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--good)_10%,transparent)]";

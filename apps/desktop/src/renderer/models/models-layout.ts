export const MODELS_PAGE_CLASS = "@container/models min-w-0 gap-4";

export const MODELS_WORKSPACE_CLASS =
  "two-column-grid grid grid-cols-[minmax(0,1.45fr)_minmax(300px,0.55fr)] gap-5 @max-[760px]/models:grid-cols-1";

export const MODELS_FORM_CLASS =
  "content-card form-card rounded-none border-0 bg-transparent p-0 shadow-none [&>.field-grid]:gap-x-5 [&>.field-grid]:gap-y-4";

export const MODEL_TUNING_CLASS =
  "mt-1.75 overflow-hidden rounded-[var(--radius-xs)] bg-[var(--surface-soft)] px-2 [&>summary]:flex [&>summary]:min-h-9 [&>summary]:cursor-pointer [&>summary]:list-none [&>summary]:items-center [&>summary]:justify-between [&>summary]:gap-3 [&>summary]:py-1.25 [&>summary::-webkit-details-marker]:hidden [&>summary>span:first-child]:grid [&>summary>span:first-child]:gap-px [&>summary>span:first-child>strong]:text-[var(--text)] [&>summary>span:first-child>strong]:text-[length:var(--text-control)] [&>summary>span:first-child>small]:text-[var(--muted)] [&>summary>span:first-child>small]:text-[length:var(--text-meta)]";

export const MODEL_TUNING_BODY_CLASS = "field-grid px-0 pt-4 pb-4";

export const MODEL_FORM_ACTIONS_CLASS =
  "form-actions mt-5 border-t border-[var(--border)] pt-4";

export const MODELS_DIAGNOSTICS_CLASS = "grid gap-2";

export const MODEL_DIAGNOSTIC_CLASS =
  "model-diagnostic overflow-hidden rounded-[4px] border border-[var(--line-subtle)] bg-[var(--surface)] [&[open]>summary]:bg-[var(--surface-soft)] [&>summary]:flex [&>summary]:min-h-10 [&>summary]:cursor-pointer [&>summary]:list-none [&>summary]:items-center [&>summary]:justify-between [&>summary]:gap-2.5 [&>summary]:px-2.5 [&>summary]:py-1.5 [&>summary::-webkit-details-marker]:hidden";

export const MODEL_DIAGNOSTIC_COPY_CLASS =
  "grid min-w-0 gap-0.5 [&>small]:text-[var(--muted)] [&>small]:text-[length:var(--text-meta)]";

export const MODEL_DIAGNOSTIC_BODY_CLASS = "px-3 pt-0 pb-2";

export const MODELS_ROW_ACTIONS_CLASS =
  "row-actions flex flex-wrap items-center justify-end gap-1.5 max-[700px]:justify-start";

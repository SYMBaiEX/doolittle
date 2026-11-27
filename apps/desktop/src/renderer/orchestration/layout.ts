const FORM_LABEL =
  "[&_label]:grid [&_label]:min-w-0 [&_label]:gap-1 [&_label]:text-[length:var(--text-control)] [&_label]:font-medium [&_label]:text-[var(--muted)] [&_label>span]:text-[length:var(--text-control)] [&_label>span]:text-[var(--text-soft)]";

const ORCHESTRATION_CLASS = {
  "orchestration-page":
    "orchestration-page relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-[var(--bg)]",
  "orchestration-refresh":
    "orchestration-refresh size-10 min-h-10 shrink-0 p-0 text-[var(--text-soft)] max-[680px]:size-11",
  "orchestration-notices":
    "orchestration-notices pointer-events-none absolute top-2.5 right-3 z-6 w-[min(360px,calc(100%_-_20px))] @max-[680px]/work:static @max-[680px]/work:w-full [&_.notice]:rounded-[var(--radius-sm)] [&_.notice]:px-2.5 [&_.notice]:py-2.25 [&_.notice]:shadow-[0_16px_48px_color-mix(in_srgb,var(--shadow)_46%,transparent)] @max-[680px]/work:[&_.notice]:rounded-none @max-[680px]/work:[&_.notice]:border-x-0 @max-[680px]/work:[&_.notice]:shadow-none",
  "orchestration-nav-row":
    "orchestration-nav-row flex min-h-10.5 shrink-0 items-center justify-between gap-3.5 border-[var(--border)] border-b bg-[var(--surface)] px-2.5 shadow-[inset_0_-1px_color-mix(in_srgb,var(--text)_2%,transparent)] max-[680px]:flex-col max-[680px]:items-stretch max-[680px]:gap-0 max-[680px]:px-2 max-[680px]:py-2",
  "orchestration-command-bar":
    "orchestration-command-bar flex flex-wrap items-center gap-2 max-[680px]:w-full [&_button]:min-h-10 [&_button]:px-3 [&_button]:py-2 [&_button]:text-[length:var(--text-control)] max-[680px]:[&_button]:min-h-11",
  "orchestration-queue-starter":
    "orchestration-queue-starter flex min-h-14 min-w-0 shrink-0 items-start gap-2.5 bg-transparent px-3 py-2 [&>.eyebrow]:shrink-0 [&>.eyebrow]:pt-px [&>.eyebrow]:text-[length:var(--text-meta)] [&>.eyebrow]:text-[var(--accent-text)] [&>div]:grid [&>div]:min-w-0 [&>div]:gap-0.5 [&_strong]:text-[length:var(--text-control)] [&_strong]:font-medium [&_strong]:leading-[1.3] [&_strong]:text-[var(--text)] [&_small]:text-[length:var(--text-meta)] [&_small]:leading-[1.35] [&_small]:text-[var(--muted)]",
  "orchestration-quick-create": `orchestration-quick-create grid shrink-0 grid-cols-[minmax(160px,0.7fr)_minmax(240px,1.2fr)_repeat(4,minmax(92px,0.45fr))_auto] items-end gap-1.75 border-[var(--border)] border-b bg-[var(--surface)] px-3 py-2.25  max-[1400px]:grid-cols-4 max-[1180px]:grid-cols-3 max-[900px]:grid-cols-2 max-[680px]:max-h-[52vh] max-[680px]:grid-cols-1 max-[680px]:overflow-auto max-[900px]:[&_.quick-title]:col-span-full max-[900px]:[&_.quick-objective]:col-span-full max-[900px]:[&_.quick-create-actions]:col-span-full ${FORM_LABEL} [&_input]:min-h-10 [&_input]:w-full [&_input]:px-1.75 [&_input]:py-1 [&_input]:text-[length:var(--text-control)] [&_select]:min-h-10 [&_select]:w-full [&_select]:px-1.75 [&_select]:py-1 [&_select]:text-[length:var(--text-control)]`,
  "quick-create-actions":
    "quick-create-actions flex items-center gap-1.75 pb-px max-[680px]:[&>button]:flex-1",
  "orchestration-task-routing-note":
    "orchestration-task-routing-note col-span-full m-0 text-[length:var(--text-meta)] leading-[1.45] text-[var(--muted)]",
  "agents-workbench": "agents-workbench flex flex-col gap-6",
  "orchestration-loading":
    "grid h-full min-h-48 place-items-center p-6 text-[length:var(--text-meta)] text-[var(--muted)]",
  "orchestration-pane-heading":
    "orchestration-pane-heading flex min-h-11 shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] bg-transparent px-3 py-2 text-[length:var(--text-control)] font-medium text-[var(--text-soft)] [&_small]:text-[length:var(--text-meta)] [&_small]:font-normal [&_small]:text-[var(--muted)]",
  "runs-heading": "runs-heading border-[var(--border)] border-t",
  selected:
    "selected font-semibold [&_strong]:font-semibold text-[var(--text)]",
  "tier-running": "tier-running",
  "tier-queued": "tier-queued",
  "tier-approval": "tier-approval",
  "tier-completed": "tier-completed",
  "tier-failed": "tier-failed",
  "master-row-top": "master-row-top",
  warn: "warn border-[color-mix(in_srgb,var(--warn)_34%,var(--border))]",
  good: "good border-[color-mix(in_srgb,var(--good)_34%,var(--border))]",
  bad: "bad border-[color-mix(in_srgb,var(--bad)_34%,var(--border))]",
  neutral: "neutral",
  "orchestration-inline-form": `orchestration-inline-form grid grid-cols-[minmax(140px,0.4fr)_minmax(240px,1fr)_minmax(180px,0.55fr)_auto] items-end gap-2 border-[var(--border)] border-b bg-[color-mix(in_srgb,var(--accent)_4%,var(--surface-soft))] p-3 max-[900px]:grid-cols-2 max-[900px]:[&_.inline-form-wide]:col-span-full ${FORM_LABEL} [&_input]:w-full [&_select]:w-full`,
  "orchestration-note-composer": `orchestration-note-composer grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 pt-1 max-[680px]:grid-cols-1 ${FORM_LABEL} [&_textarea]:min-h-13 [&_textarea]:w-full [&_textarea]:resize-y`,
  "orchestration-steps":
    "orchestration-steps m-0 grid list-decimal gap-2 pl-4.5 text-[length:var(--text-control)] leading-[1.5] text-[var(--text-soft)]",
  "orchestration-plan-control":
    "orchestration-plan-control grid grid-cols-[minmax(260px,1fr)_auto] items-center gap-2.5 rounded-[var(--radius-xs)] bg-[var(--surface-soft)] px-2.5 py-2.5 max-[680px]:grid-cols-1 [&>div]:grid [&>div]:gap-0.75 [&_strong]:text-[length:var(--text-control)] [&_strong]:font-semibold [&_strong]:text-[var(--text)] [&_span]:text-[length:var(--text-meta)] [&_span]:leading-[1.45] [&_span]:text-[var(--muted)]",
  "orchestration-plan-steer":
    "orchestration-plan-steer grid grid-cols-[minmax(180px,0.6fr)_minmax(260px,1fr)_auto] items-center gap-2.5 rounded-[var(--radius-xs)] bg-[var(--surface-soft)] px-2.5 py-2.5 max-[680px]:grid-cols-1 [&>div]:grid [&>div]:gap-0.75 [&_strong]:text-[length:var(--text-control)] [&_strong]:font-semibold [&_strong]:text-[var(--text)] [&_span]:text-[length:var(--text-meta)] [&_span]:leading-[1.45] [&_span]:text-[var(--muted)] [&_label]:min-w-0 [&_label]:w-full [&_textarea]:min-h-13 [&_textarea]:min-w-0 [&_textarea]:w-full [&_textarea]:resize-y",
  "orchestration-runs-layout":
    "orchestration-runs-layout grid h-full min-h-0 grid-cols-[300px_minmax(230px,27%)_minmax(0,1fr)]",
  "orchestration-launcher":
    "orchestration-launcher min-h-0 min-w-0 overflow-auto border-[var(--border)] border-r bg-[var(--surface)]",
  "orchestration-run-browser":
    "orchestration-run-browser flex min-h-0 min-w-0 flex-col overflow-hidden border-[var(--border)] border-r bg-[var(--surface)]",
  "orchestration-mode-grid":
    "orchestration-mode-grid m-0 grid min-w-0 grid-cols-2 gap-0 border-0 px-2 py-1.25 [&>legend]:sr-only [&_button]:grid [&_button]:min-h-10 [&_button]:gap-0.5 [&_button]:rounded-none [&_button]:border [&_button]:border-transparent [&_button]:border-b-[var(--border)] [&_button]:bg-transparent [&_button]:p-1.5 [&_button]:text-left [&_button]:text-[var(--muted)] [&_button:hover]:bg-[var(--surface-hover)] [&_button:focus-visible]:bg-[var(--surface-hover)]  [&_button.selected]:font-semibold [&_button.selected]:text-[var(--text)] [&_strong]:text-[length:var(--text-control)] [&_span]:text-[length:var(--text-meta)] [&_span]:leading-[1.35] [&_span]:text-[var(--muted)]",
  "orchestration-codegen-form": `orchestration-codegen-form grid gap-2.25 px-2.5 pt-0.5 pb-2.5 ${FORM_LABEL} [&_input]:w-full [&_textarea]:w-full [&_textarea]:resize-y`,
  "orchestration-runtime-version":
    "orchestration-runtime-version m-0 border-[var(--border)] border-t px-2.5 py-2.25 font-[var(--font-mono)] text-[length:var(--text-meta)] leading-[1.45] text-[var(--muted)]",
  "orchestration-runtime-detail":
    "orchestration-runtime-detail m-0 px-2.5 pt-0 pb-2.5 text-[length:var(--text-meta)] leading-[1.45] text-[var(--warn)]",
  "orchestration-run-detail": "orchestration-run-detail",
  "orchestration-subheading":
    "orchestration-subheading flex items-start justify-between gap-3 [&_h3]:mt-1 [&_h3]:mb-0 [&_h3]:font-[var(--font-display)] [&_h3]:text-[length:var(--text-control)] [&_h3]:font-semibold [&_h3]:leading-[var(--line-title)]",
} as const;

export function orchestrationClass(
  ...names: Array<string | false | null | undefined>
): string {
  return names
    .filter((name): name is string => Boolean(name))
    .flatMap((name) => name.split(/\s+/u))
    .map(
      (name) =>
        ORCHESTRATION_CLASS[name as keyof typeof ORCHESTRATION_CLASS] ?? name,
    )
    .join(" ");
}

export const ORCHESTRATION_QUEUE_STARTER_CLASS =
  ORCHESTRATION_CLASS["orchestration-queue-starter"];

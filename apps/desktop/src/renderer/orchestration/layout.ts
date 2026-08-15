const FORM_LABEL =
  "[&_label]:grid [&_label]:min-w-0 [&_label]:gap-1 [&_label]:text-[9px] [&_label]:font-semibold [&_label]:text-[var(--muted)] [&_label>span]:font-[var(--font-mono)] [&_label>span]:text-[8px] [&_label>span]:tracking-[0.08em] [&_label>span]:text-[var(--faint)] [&_label>span]:uppercase";

const DETAIL_CODE =
  "[&_code]:block [&_code]:rounded-[3px] [&_code]:border [&_code]:border-[var(--border)] [&_code]:bg-[var(--surface-soft)] [&_code]:p-2 [&_code]:font-[var(--font-mono)] [&_code]:text-[10px] [&_code]:leading-[1.45] [&_code]:text-[var(--text-soft)] [&_code]:[overflow-wrap:anywhere]";

const ORCHESTRATION_CLASS = {
  "orchestration-page":
    "page orchestration-page relative flex h-full min-h-0 w-full flex-col gap-0 overflow-hidden bg-[var(--bg)] p-0",
  "orchestration-header":
    "orchestration-header flex min-h-13 shrink-0 items-center justify-between gap-4 border-[var(--border)] border-b bg-[var(--surface)] px-3 py-1.75 [&>div:first-child]:min-w-0 [&_.eyebrow]:text-[8px] [&_.eyebrow]:tracking-[0.1em] [&_.eyebrow]:text-[var(--accent)] [&_h1]:m-0 [&_h1]:font-[var(--font-display)] [&_h1]:text-[15px] [&_h1]:font-semibold [&_h1]:tracking-[-0.01em] [&_p]:mt-px [&_p]:mb-0 [&_p]:text-[9px] [&_p]:text-[var(--muted)] max-[680px]:min-h-15.5 max-[680px]:px-3 max-[680px]:py-2.5 max-[900px]:[&_p]:hidden",
  "orchestration-header-metrics":
    "orchestration-header-metrics flex flex-wrap items-center gap-0 max-[900px]:[&_.orchestration-summary-chip:nth-child(2)]:hidden",
  "orchestration-summary-chip":
    "orchestration-summary-chip inline-flex min-h-6 min-w-0 items-center justify-center gap-1.25 border-0 border-l border-l-[var(--border)] bg-transparent px-2.25 py-0.5 text-[10px] text-[var(--text-soft)] whitespace-nowrap [&_strong]:font-[var(--font-mono)] [&_strong]:text-[11px] [&_strong]:leading-none [&_small]:font-[var(--font-mono)] [&_small]:text-[8px] [&_small]:tracking-[0.08em] [&_small]:text-[var(--muted)] [&_small]:uppercase max-[680px]:hidden",
  "orchestration-refresh":
    "orchestration-refresh size-6.5 min-h-6.5 p-0 text-sm text-[var(--text-soft)]",
  "orchestration-notices":
    "orchestration-notices pointer-events-none absolute top-19.5 right-4 z-6 w-[min(360px,calc(100%_-_20px))] [&_.notice]:rounded-[5px] [&_.notice]:px-2.5 [&_.notice]:py-2.25 [&_.notice]:shadow-[0_16px_48px_color-mix(in_srgb,var(--shadow)_46%,transparent)]",
  "orchestration-nav-row":
    "orchestration-nav-row flex min-h-10.5 shrink-0 items-center justify-between gap-3.5 border-[var(--border)] border-b bg-[var(--surface)] px-2.5 shadow-[inset_0_-1px_color-mix(in_srgb,var(--text)_2%,transparent)] max-[900px]:flex-col max-[900px]:items-stretch max-[900px]:gap-0 max-[900px]:px-2 max-[900px]:pt-0 max-[900px]:pb-1.5 max-[680px]:items-start max-[680px]:py-2",
  "orchestration-tabs":
    "orchestration-tabs flex min-h-10.5 self-stretch overflow-x-auto max-[680px]:w-full [&>button]:relative [&>button]:inline-flex [&>button]:min-w-18.5 [&>button]:items-center [&>button]:justify-start [&>button]:gap-1.5 [&>button]:border-0 [&>button]:bg-transparent [&>button]:px-2.75 [&>button]:font-[var(--font-mono)] [&>button]:text-[9px] [&>button]:font-semibold [&>button]:tracking-[0.07em] [&>button]:text-[var(--muted)] [&>button]:uppercase [&>button:hover]:bg-[var(--surface-hover)] [&>button:hover]:text-[var(--text)] [&>button:focus-visible]:bg-[var(--surface-hover)] [&>button:focus-visible]:text-[var(--text)] [&>button.selected]:text-[var(--text)] [&>button.selected]:after:absolute [&>button.selected]:after:right-2.5 [&>button.selected]:after:bottom-[-1px] [&>button.selected]:after:left-2.5 [&>button.selected]:after:h-0.5 [&>button.selected]:after:bg-[var(--accent)] [&>button.selected]:after:content-[''] [&>button>span]:min-w-4.25 [&>button>span]:px-1 [&>button>span]:py-px [&>button>span]:font-[var(--font-mono)] [&>button>span]:text-[8px] [&>button>span]:font-bold [&>button>span]:text-[var(--muted)] max-[680px]:[&>button]:min-w-max",
  "orchestration-command-bar":
    "orchestration-command-bar flex items-center gap-1.25 max-[680px]:w-full max-[680px]:flex-wrap [&_.primary-button]:h-6.5 [&_.primary-button]:min-h-6.5 [&_.primary-button]:px-2 [&_.primary-button]:py-0.75 [&_.primary-button]:text-[9px] [&_.primary-button]:normal-case [&_.secondary-button]:h-6.5 [&_.secondary-button]:min-h-6.5 [&_.secondary-button]:px-2 [&_.secondary-button]:py-0.75 [&_.secondary-button]:text-[9px] [&_.secondary-button]:normal-case max-[680px]:[&_.primary-button]:flex-1 max-[680px]:[&_.secondary-button]:flex-1",
  "orchestration-supervision":
    "orchestration-supervision group relative [&>summary]:flex [&>summary]:min-h-6.5 [&>summary]:cursor-pointer [&>summary]:list-none [&>summary]:items-center [&>summary]:gap-1.25 [&>summary]:rounded-[var(--radius-xs)] [&>summary]:border [&>summary]:border-[var(--border)] [&>summary]:bg-[var(--surface-raised)] [&>summary]:px-2 [&>summary]:py-0.75 [&>summary]:text-[9px] [&>summary]:text-[var(--text-soft)] [&>summary::-webkit-details-marker]:hidden [&>summary_small]:font-[var(--font-mono)] [&>summary_small]:text-[8px] [&>summary_small]:text-[var(--muted)] [&>summary_i]:not-italic [&>summary_i]:text-[var(--muted)] [&>summary_i]:transition-transform group-open:[&>summary_i]:rotate-180 motion-reduce:[&>summary_i]:transition-none",
  "orchestration-supervision__body":
    "orchestration-supervision__body absolute top-[calc(100%+6px)] right-0 z-8 flex w-max items-center gap-1.75 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface-raised)] p-2 shadow-[0_14px_36px_color-mix(in_srgb,var(--shadow)_36%,transparent)] [&_label]:text-[8px] [&_label]:tracking-[0.06em] [&_input]:h-6.5 [&_input]:min-h-6.5 [&_input]:w-10.5 [&_input]:px-2 [&_input]:py-0.75 [&_input]:text-[9px]",
  "orchestration-queue-starter":
    "orchestration-queue-starter mx-auto mt-[clamp(12px,6vh,72px)] mb-3 flex min-h-22 w-[min(calc(100%_-_24px),920px)] shrink-0 items-center gap-3.5 rounded-[var(--radius-sm)] border border-[var(--border)] border-l-2 border-l-[var(--accent)] bg-[color-mix(in_srgb,var(--surface)_90%,var(--bg))] px-4.5 py-4 [&>.eyebrow]:shrink-0 [&>.eyebrow]:text-[9px] [&>.eyebrow]:text-[var(--accent)] [&>div]:grid [&>div]:min-w-0 [&>div]:gap-0.75 [&_strong]:text-xs [&_strong]:text-[var(--text)] [&_small]:text-[10px] [&_small]:text-[var(--muted)]",
  "orchestration-quick-create": `orchestration-quick-create grid shrink-0 grid-cols-[minmax(160px,0.7fr)_minmax(240px,1.2fr)_repeat(4,minmax(92px,0.45fr))_auto] items-end gap-1.75 border-[var(--border)] border-b bg-[var(--surface)] px-3 py-2.25 shadow-[inset_2px_0_var(--accent)] max-[1400px]:grid-cols-4 max-[1180px]:grid-cols-3 max-[900px]:grid-cols-2 max-[680px]:max-h-[52vh] max-[680px]:grid-cols-1 max-[680px]:overflow-auto max-[900px]:[&_.quick-title]:col-span-full max-[900px]:[&_.quick-objective]:col-span-full max-[900px]:[&_.quick-create-actions]:col-span-full ${FORM_LABEL} [&_input]:min-h-6.75 [&_input]:w-full [&_input]:px-1.75 [&_input]:py-1 [&_input]:text-[10px] [&_select]:min-h-6.75 [&_select]:w-full [&_select]:px-1.75 [&_select]:py-1 [&_select]:text-[10px]`,
  "quick-create-actions":
    "quick-create-actions flex items-center gap-1.75 pb-px max-[680px]:[&>button]:flex-1",
  "orchestration-task-routing-note":
    "orchestration-task-routing-note col-span-full m-0 text-[10px] leading-[1.45] text-[var(--muted)]",
  "orchestration-panel": "orchestration-panel min-h-0 flex-1 overflow-hidden",
  "orchestration-loading":
    "grid h-full min-h-48 place-items-center p-6 text-xs text-[var(--muted)]",
  "orchestration-master-detail":
    "orchestration-master-detail grid h-full min-h-0 grid-cols-[minmax(280px,330px)_minmax(0,1fr)] max-[900px]:grid-cols-[minmax(220px,38%)_minmax(0,1fr)] max-[680px]:flex max-[680px]:flex-col max-[680px]:overflow-auto",
  "orchestration-master":
    "orchestration-master flex min-h-0 min-w-0 flex-col border-[var(--border)] border-r bg-[var(--surface)] max-[680px]:min-h-60 max-[680px]:max-h-[42vh] max-[680px]:border-r-0 max-[680px]:border-b",
  "orchestration-pane-heading":
    "orchestration-pane-heading flex min-h-9 shrink-0 items-center justify-between gap-2.5 border-[var(--border)] border-b bg-[var(--surface)] px-2.5 py-1.75 font-[var(--font-mono)] text-[9px] font-bold tracking-[0.08em] text-[var(--text-soft)] uppercase [&_small]:text-[10px] [&_small]:font-medium [&_small]:tracking-normal [&_small]:text-[var(--muted)] [&_small]:normal-case",
  "runs-heading": "runs-heading border-[var(--border)] border-t",
  "orchestration-scroll":
    "orchestration-scroll min-h-0 flex-1 overflow-auto px-1 pt-0.5 pb-1.5",
  "orchestration-queue-controls":
    "orchestration-queue-controls grid shrink-0 grid-cols-[minmax(0,1fr)_minmax(92px,0.46fr)] gap-1.25 border-[var(--border)] border-b px-1.75 py-1.5 [&_label]:min-w-0 [&_input]:min-h-7 [&_input]:w-full [&_input]:px-1.75 [&_input]:py-1 [&_input]:text-[9px] [&_select]:min-h-7 [&_select]:w-full [&_select]:px-1.75 [&_select]:py-1 [&_select]:text-[9px]",
  "orchestration-master-list":
    "orchestration-master-list m-0 grid list-none gap-0 p-0 [&>li]:min-w-0 [&>li+li]:border-[color-mix(in_srgb,var(--border)_70%,transparent)] [&>li+li]:border-t",
  "orchestration-master-footer":
    "orchestration-master-footer flex items-center justify-between gap-2 px-2.25 pt-2 pb-0.5 font-[var(--font-mono)] text-[9px] text-[var(--muted)] [&_.secondary-button]:min-h-6.5 [&_.secondary-button]:px-1.75 [&_.secondary-button]:py-1 [&_.secondary-button]:text-[9px]",
  "orchestration-master-item":
    "orchestration-master-item grid min-h-13.75 w-full min-w-0 gap-1 rounded-none border border-transparent bg-transparent px-2.25 py-2 text-left text-[var(--text-soft)] transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_5%,var(--surface-hover))] focus-visible:bg-[color-mix(in_srgb,var(--accent)_5%,var(--surface-hover))] [&_.badge]:min-h-4.5 [&_.badge]:rounded-[3px] [&_.badge]:px-1.25 [&_.badge]:py-0.5 [&_.badge]:text-[8px]",
  selected:
    "selected bg-[color-mix(in_srgb,var(--accent)_5%,var(--surface-hover))] text-[var(--text)] shadow-[inset_3px_0_var(--accent)]",
  "tier-running": "tier-running",
  "tier-queued": "tier-queued",
  "tier-approval": "tier-approval",
  "tier-completed": "tier-completed",
  "tier-failed": "tier-failed",
  "master-row":
    "master-row flex min-w-0 items-center justify-between gap-2 max-[680px]:items-start",
  "master-row-bottom": "master-row-bottom items-end",
  "master-row-top": "master-row-top",
  "master-title-line":
    "master-title-line flex min-w-0 items-center gap-2 [&_strong]:truncate [&_strong]:text-xs [&_strong]:font-semibold [&_strong]:leading-[1.35]",
  "master-status-dot":
    "master-status-dot size-2 shrink-0 rounded-full bg-[color-mix(in_srgb,var(--text)_48%,transparent)] [.tier-running_&]:bg-[color-mix(in_srgb,var(--accent)_68%,var(--warn))] [.tier-queued_&]:bg-[color-mix(in_srgb,var(--text)_72%,var(--accent))] [.tier-approval_&]:bg-[var(--warn)] [.tier-completed_&]:bg-[var(--good)] [.tier-failed_&]:bg-[var(--bad)]",
  "master-summary":
    "master-summary truncate text-[9px] leading-[1.35] text-[var(--muted)]",
  "master-meta-pills":
    "master-meta-pills inline-flex min-w-0 items-center gap-1.25 overflow-hidden font-[var(--font-mono)] text-[8px] leading-[1.2] text-[var(--text-soft)] whitespace-nowrap [&>span]:inline-flex [&>span]:min-w-0 [&>span]:items-center [&>span]:truncate [&>span]:rounded-full [&>span]:border [&>span]:border-[color-mix(in_srgb,var(--border)_74%,transparent)] [&>span]:bg-[color-mix(in_srgb,var(--surface-soft)_84%,transparent)] [&>span]:px-1 [&>span]:py-px [&>span]:text-[var(--muted)]",
  "orchestration-task-rail-meta":
    "orchestration-task-rail-meta block truncate text-[8px] leading-[1.25] text-[var(--muted)]",
  "orchestration-detail":
    "orchestration-detail min-h-0 min-w-0 overflow-auto bg-[var(--bg)] px-5.5 pt-4 pb-6.5 max-[680px]:min-h-95 max-[680px]:overflow-visible [&>*]:w-[min(100%,1080px)]",
  "orchestration-detail-header":
    "orchestration-detail-header flex max-w-225 items-start justify-between gap-3.5 border-[var(--border)] border-b pb-3 [&>div]:min-w-0 [&_h2]:mt-0.75 [&_h2]:mb-1 [&_h2]:font-[var(--font-display)] [&_h2]:text-[clamp(19px,1.65vw,24px)] [&_h2]:font-semibold [&_h2]:leading-[1.14] [&_h2]:tracking-[-0.025em] [&_p]:m-0 [&_p]:max-w-170 [&_p]:text-[11px] [&_p]:leading-[1.55] [&_p]:text-[var(--text-soft)]",
  "detail-kicker":
    "detail-kicker block font-[var(--font-mono)] text-[8px] font-bold tracking-[0.09em] text-[var(--accent)] uppercase",
  "orchestration-detail-tags":
    "orchestration-detail-tags flex max-w-225 flex-wrap items-center gap-1.5 px-0 pt-2.5 pb-0.5 max-[680px]:items-start",
  "orchestration-detail-facts": "orchestration-detail-facts items-center",
  "orchestration-detail-tag":
    "orchestration-detail-tag inline-flex min-h-5 items-center rounded-full border border-[color-mix(in_srgb,var(--border)_76%,transparent)] bg-[color-mix(in_srgb,var(--surface-soft)_70%,transparent)] px-2 py-0 font-[var(--font-mono)] text-[8px] text-[var(--muted)]",
  warn: "warn border-[color-mix(in_srgb,var(--warn)_34%,var(--border))]",
  good: "good border-[color-mix(in_srgb,var(--good)_34%,var(--border))]",
  bad: "bad border-[color-mix(in_srgb,var(--bad)_34%,var(--border))]",
  neutral: "neutral",
  "orchestration-action-card":
    "orchestration-action-card mt-2.5 grid max-w-225 gap-2.5 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--border)_82%,transparent)] bg-[color-mix(in_srgb,var(--surface)_88%,transparent)] p-3",
  "orchestration-action-deck":
    "orchestration-action-deck flex flex-wrap items-start justify-start gap-x-3 gap-y-2.25 p-0 [&_button]:min-h-6.75 [&_button]:px-2 [&_button]:py-1 [&_button]:text-[9px] [&_button]:tracking-normal [&_button]:normal-case [&_.text-button]:px-1.25 max-[900px]:flex-col",
  "orchestration-action-main":
    "orchestration-action-main flex shrink-0 flex-wrap items-center gap-1.25 [&_.primary-button]:min-w-17",
  "orchestration-action-secondary":
    "orchestration-action-secondary ml-auto flex flex-[1_1_280px] flex-wrap items-center justify-end gap-1.25 max-[900px]:ml-0",
  "orchestration-action-overflow":
    "orchestration-action-overflow group relative [&>summary]:inline-flex [&>summary]:min-h-6.75 [&>summary]:cursor-pointer [&>summary]:list-none [&>summary]:items-center [&>summary]:px-2 [&>summary]:py-1 [&>summary]:text-[9px] [&>summary]:text-[var(--muted)] [&>summary::-webkit-details-marker]:hidden [&>summary]:after:ml-1.5 [&>summary]:after:font-[var(--font-mono)] [&>summary]:after:text-[var(--accent)] [&>summary]:after:content-['+'] group-open:[&>summary]:after:content-['−']",
  "orchestration-action-overflow__body":
    "orchestration-action-overflow__body absolute top-[calc(100%+6px)] right-0 z-3 grid min-w-42.5 gap-1 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface-raised)] p-2 shadow-[0_14px_36px_color-mix(in_srgb,var(--shadow)_28%,transparent)] max-[900px]:right-auto max-[900px]:left-0 [&_.text-button]:justify-start [&_.text-button]:px-0",
  "orchestration-confirm":
    "orchestration-confirm my-2 grid w-[min(100%,680px)] max-w-170 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2.5 rounded-[5px] border border-[color-mix(in_srgb,var(--bad)_25%,var(--border))] bg-[color-mix(in_srgb,var(--bad)_5%,var(--surface-soft))] px-2.5 py-2.25 [&>div]:grid [&>div]:min-w-45 [&>div]:gap-0.75 [&_strong]:text-xs [&_strong]:text-[var(--bad)] [&_span]:text-[10px] [&_span]:text-[var(--text-soft)] [&_label]:flex [&_label]:items-center [&_label]:gap-1.5 [&_label]:text-[10px] [&_label]:text-[var(--text-soft)] [&_label]:whitespace-nowrap [&_button]:min-h-6.75 [&_button]:px-2 [&_button]:py-1 [&_button]:text-[9px] [&_button]:normal-case max-[900px]:grid-cols-1 max-[900px]:items-start",
  "orchestration-run-confirm":
    "orchestration-run-confirm mt-2.5 mb-0 border-[color-mix(in_srgb,var(--bad)_34%,var(--border))]",
  "orchestration-inline-form": `orchestration-inline-form grid grid-cols-[minmax(140px,0.4fr)_minmax(240px,1fr)_minmax(180px,0.55fr)_auto] items-end gap-2 border-[var(--border)] border-b bg-[color-mix(in_srgb,var(--accent)_4%,var(--surface-soft))] p-3 max-[900px]:grid-cols-2 max-[900px]:[&_.inline-form-wide]:col-span-full ${FORM_LABEL} [&_input]:w-full [&_select]:w-full`,
  "orchestration-detail-grid":
    "orchestration-detail-grid grid max-w-245 grid-cols-[minmax(240px,0.62fr)_minmax(300px,1.38fr)] gap-7 py-4.5 max-[900px]:grid-cols-1 [&>dl]:m-0 [&>dl]:grid [&>dl]:content-start [&>dl]:border-[var(--border)] [&>dl]:border-t",
  "orchestration-detail-row":
    "orchestration-detail-row grid min-w-0 grid-cols-[minmax(88px,0.4fr)_minmax(0,1fr)] gap-3 border-[var(--border)] border-b py-2 [&_dt]:font-[var(--font-mono)] [&_dt]:text-[10px] [&_dt]:text-[var(--muted)] [&_dd]:m-0 [&_dd]:min-w-0 [&_dd]:text-[11px] [&_dd]:leading-[1.4] [&_dd]:text-[var(--text-soft)] [&_dd]:[overflow-wrap:anywhere]",
  "orchestration-mini-dl":
    "orchestration-mini-dl m-0 grid content-start border-[var(--border)] border-t",
  "orchestration-evidence": `orchestration-evidence grid min-w-0 content-start gap-2 border-0 border-[var(--border)] border-t bg-transparent p-0 [&>h3]:mt-2 [&>strong]:mt-2 [&_ul]:m-0 [&_ul]:grid [&_ul]:list-none [&_ul]:gap-1.75 [&_ul]:p-0 [&_li]:relative [&_li]:pl-3 [&_li]:text-[11px] [&_li]:leading-[1.45] [&_li]:text-[var(--text-soft)] [&_li]:before:absolute [&_li]:before:top-[0.48em] [&_li]:before:left-0 [&_li]:before:size-1 [&_li]:before:rounded-full [&_li]:before:bg-[var(--accent)] [&_li]:before:content-[''] ${DETAIL_CODE}`,
  "orchestration-workspace-card":
    "orchestration-workspace-card min-w-0 gap-2.5 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--border)_82%,transparent)] bg-[color-mix(in_srgb,var(--surface-raised)_72%,transparent)] p-3.25",
  "orchestration-empty-line":
    "orchestration-empty-line m-0 text-[11px] leading-[1.5] text-[var(--muted)]",
  "orchestration-note-composer": `orchestration-note-composer grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 border-[color-mix(in_srgb,var(--border)_76%,transparent)] border-t pt-1.5 max-[680px]:grid-cols-1 ${FORM_LABEL} [&_textarea]:min-h-13 [&_textarea]:w-full [&_textarea]:resize-y`,
  "orchestration-task-diagnostics":
    "orchestration-task-diagnostics group mt-3.5 max-w-225 border-[var(--border)] border-b [&>summary]:grid [&>summary]:min-h-9.5 [&>summary]:cursor-pointer [&>summary]:list-none [&>summary]:grid-cols-[minmax(0,1fr)_auto_14px] [&>summary]:items-center [&>summary]:gap-3 [&>summary]:px-0 [&>summary]:py-2 [&>summary]:text-[var(--text-soft)] [&>summary::-webkit-details-marker]:hidden [&>summary>span]:grid [&>summary>span]:gap-0.5 [&>summary_strong]:text-[10px] [&>summary_strong]:text-[var(--text)] [&>summary_small]:font-[var(--font-mono)] [&>summary_small]:text-[8px] [&>summary_small]:leading-[1.35] [&>summary_small]:text-[var(--muted)] [&>summary]:after:text-right [&>summary]:after:font-[var(--font-mono)] [&>summary]:after:text-sm [&>summary]:after:leading-none [&>summary]:after:text-[var(--muted)] [&>summary]:after:content-['+'] group-open:[&>summary]:after:content-['−'] [&>dl]:m-0 [&>dl]:grid [&>dl]:grid-cols-2 [&>dl]:border-[color-mix(in_srgb,var(--border)_70%,transparent)] [&>dl]:border-t [&>dl]:pt-0 [&>dl]:pb-2.5 max-[900px]:[&>dl]:grid-cols-1 [&_.orchestration-detail-row]:py-1.75 [&_.orchestration-detail-row]:pr-2.5",
  "orchestration-task-workspace":
    "orchestration-task-workspace grid max-w-225 grid-cols-[minmax(220px,0.78fr)_minmax(260px,1.22fr)] gap-4 pt-4 max-[900px]:grid-cols-1",
  "orchestration-health-strip":
    "orchestration-health-strip grid grid-cols-3 gap-0 border-[var(--border)] border-b bg-[var(--border)] px-2 py-1.5 [&_span]:bg-[var(--surface)] [&_span]:px-1.5 [&_span]:py-1.75 [&_span]:text-center [&_span]:text-[8px] [&_span]:text-[var(--muted)] [&_strong]:text-[var(--text)]",
  "orchestration-signal-grid":
    "orchestration-signal-grid grid grid-cols-2 gap-1.75 [&_span]:rounded-[var(--radius-sm)] [&_span]:border [&_span]:border-[var(--border)] [&_span]:p-2 [&_span]:text-center [&_span]:text-[10px] [&_span]:font-bold [&_span.good]:bg-[var(--good-soft)] [&_span.good]:text-[var(--good)] [&_span.bad]:bg-[var(--bad-soft)] [&_span.bad]:text-[var(--bad)]",
  "orchestration-steps":
    "orchestration-steps m-0 grid list-decimal gap-2 pl-4.5 text-[11px] leading-[1.5] text-[var(--text-soft)]",
  "orchestration-plan-control":
    "orchestration-plan-control grid grid-cols-[minmax(260px,1fr)_auto] items-center gap-2.5 border-[var(--border)] border-b py-3 max-[680px]:grid-cols-1 [&>div]:grid [&>div]:gap-0.75 [&_strong]:text-xs [&_strong]:text-[var(--text)] [&_span]:text-[10px] [&_span]:leading-[1.45] [&_span]:text-[var(--muted)]",
  "orchestration-plan-steer":
    "orchestration-plan-steer grid grid-cols-[minmax(180px,0.6fr)_minmax(260px,1fr)_auto] items-center gap-2.5 border-[var(--border)] border-b py-3 max-[680px]:grid-cols-1 [&>div]:grid [&>div]:gap-0.75 [&_strong]:text-xs [&_strong]:text-[var(--text)] [&_span]:text-[10px] [&_span]:leading-[1.45] [&_span]:text-[var(--muted)] [&_label]:min-w-0 [&_label]:w-full [&_textarea]:min-h-13 [&_textarea]:min-w-0 [&_textarea]:w-full [&_textarea]:resize-y",
  "orchestration-control-footnote":
    "orchestration-control-footnote flex items-baseline gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2.5 text-[10px] text-[var(--muted)] [&_strong]:text-[var(--text-soft)]",
  "orchestration-runs-layout":
    "orchestration-runs-layout grid h-full min-h-0 grid-cols-[260px_minmax(230px,27%)_minmax(0,1fr)] max-[1180px]:grid-cols-[230px_minmax(210px,30%)_minmax(0,1fr)] max-[900px]:grid-cols-[220px_minmax(0,1fr)] max-[680px]:flex max-[680px]:flex-col max-[680px]:overflow-auto",
  "orchestration-launcher":
    "orchestration-launcher min-h-0 min-w-0 overflow-auto border-[var(--border)] border-r bg-[var(--surface)] max-[680px]:min-h-60 max-[680px]:max-h-[42vh] max-[680px]:border-r-0 max-[680px]:border-b",
  "orchestration-run-browser":
    "orchestration-run-browser flex min-h-0 min-w-0 flex-col overflow-hidden border-[var(--border)] border-r bg-[var(--surface)] max-[680px]:min-h-60 max-[680px]:max-h-[42vh] max-[680px]:border-r-0 max-[680px]:border-b",
  "orchestration-mode-grid":
    "orchestration-mode-grid m-0 grid min-w-0 grid-cols-2 gap-0 border-0 px-2 py-1.25 [&>legend]:sr-only [&_button]:grid [&_button]:min-h-11.5 [&_button]:gap-1 [&_button]:rounded-none [&_button]:border [&_button]:border-transparent [&_button]:border-b-[var(--border)] [&_button]:bg-transparent [&_button]:p-1.75 [&_button]:text-left [&_button]:text-[var(--muted)] [&_button:hover]:bg-[var(--surface-hover)] [&_button:focus-visible]:bg-[var(--surface-hover)] [&_button.selected]:bg-[var(--surface-hover)] [&_button.selected]:text-[var(--text)] [&_strong]:text-[11px] [&_span]:text-[10px] [&_span]:leading-[1.35] [&_span]:text-[var(--muted)]",
  "orchestration-codegen-form": `orchestration-codegen-form grid gap-2.25 px-2.5 pt-0.5 pb-2.5 ${FORM_LABEL} [&_input]:w-full [&_textarea]:w-full [&_textarea]:resize-y`,
  "orchestration-runtime-version":
    "orchestration-runtime-version m-0 border-[var(--border)] border-t px-2.5 py-2.25 font-[var(--font-mono)] text-[10px] leading-[1.45] text-[var(--muted)]",
  "orchestration-runtime-detail":
    "orchestration-runtime-detail m-0 px-2.5 pt-0 pb-2.5 text-[10px] leading-[1.45] text-[var(--warn)]",
  "orchestration-workflow-list":
    "orchestration-workflow-list min-h-27.5 max-h-[42%] overflow-auto px-1 [&_button]:grid [&_button]:w-full [&_button]:gap-1 [&_button]:rounded-none [&_button]:border-0 [&_button]:border-[color-mix(in_srgb,var(--border)_70%,transparent)] [&_button]:border-b [&_button]:bg-transparent [&_button]:px-2.25 [&_button]:py-2 [&_button]:text-left [&_button]:text-[var(--text-soft)] [&_button:hover]:bg-[var(--surface-hover)] [&_button:focus-visible]:bg-[var(--surface-hover)] [&_button.selected]:bg-[var(--surface-hover)] [&_button.selected]:text-[var(--text)] [&_button.selected]:shadow-[inset_3px_0_var(--accent)] [&_button>span]:flex [&_button>span]:min-w-0 [&_button>span]:items-center [&_button>span]:justify-between [&_button>span]:gap-1.75 [&_strong]:truncate [&_strong]:text-[11px] [&_small]:font-[var(--font-mono)] [&_small]:text-[10px] [&_small]:text-[var(--muted)]",
  "orchestration-run-list": "orchestration-run-list min-h-0 max-h-none flex-1",
  "orchestration-run-detail":
    "orchestration-run-detail max-[900px]:col-span-full max-[900px]:border-[var(--border)] max-[900px]:border-t",
  "orchestration-run-toolbar":
    "orchestration-run-toolbar flex max-w-245 items-center justify-between gap-3 border-[var(--border)] border-b py-2 text-[10px] text-[var(--muted)] max-[680px]:flex-col max-[680px]:items-start",
  "orchestration-run-actions":
    "orchestration-run-actions flex items-center gap-1.75",
  "orchestration-bundle-receipt": `orchestration-bundle-receipt my-3 grid grid-cols-[auto_minmax(160px,1fr)_auto] items-center gap-2.5 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--good)_28%,var(--border))] bg-[var(--good-soft)] p-2.5 text-[10px] text-[var(--muted)] max-[680px]:grid-cols-1 [&_strong]:text-[var(--good)] ${DETAIL_CODE}`,
  "orchestration-run-inspector":
    "orchestration-run-inspector grid gap-3.25 pt-3.5",
  "orchestration-subheading":
    "orchestration-subheading flex items-start justify-between gap-3 [&_h3]:mt-1 [&_h3]:mb-0 [&_h3]:font-[var(--font-display)] [&_h3]:text-base",
  "orchestration-run-facts":
    "orchestration-run-facts m-0 grid grid-cols-2 content-start gap-x-4.5 border-[var(--border)] border-t max-[900px]:grid-cols-1",
  "orchestration-output-grid":
    "orchestration-output-grid grid grid-cols-2 gap-2.5 max-[1180px]:grid-cols-1 [&_section]:grid [&_section]:min-w-0 [&_section]:gap-1.75 [&_pre]:m-0 [&_pre]:min-h-28 [&_pre]:max-h-60 [&_pre]:overflow-auto [&_pre]:whitespace-pre-wrap [&_pre]:rounded-[var(--radius-sm)] [&_pre]:border [&_pre]:border-[var(--border)] [&_pre]:bg-[var(--surface-soft)] [&_pre]:p-2.75 [&_pre]:font-[var(--font-mono)] [&_pre]:text-[10px] [&_pre]:leading-[1.55] [&_pre]:text-[var(--text-soft)] [&_pre]:[overflow-wrap:anywhere]",
  "orchestration-artifacts": `orchestration-artifacts grid gap-1.75 ${DETAIL_CODE}`,
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

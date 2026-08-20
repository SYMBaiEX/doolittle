export const REVIEW_PAGE_CLASS =
  "page review-page flex h-full min-h-0 flex-col gap-2 overflow-hidden bg-[var(--bg)] px-3.5 pt-3 pb-3.5 max-[760px]:overflow-auto";

export const REVIEW_PAGE_EMBEDDED_CLASS = "review-page--embedded gap-0 p-0";

export function reviewPageClass(embedded: boolean): string {
  return `${REVIEW_PAGE_CLASS} ${embedded ? REVIEW_PAGE_EMBEDDED_CLASS : ""}`;
}

export const REVIEW_HEADER_CLASS =
  "review-header flex min-h-13.5 shrink-0 items-center justify-between gap-5.5 border-[color-mix(in_srgb,var(--border)_72%,transparent)] border-b px-px pt-0 pb-2 [&>div:first-child]:min-w-0 [&_h1]:mt-0.5 [&_h1]:mb-0.5 [&_h1]:font-[var(--font-display)] [&_h1]:text-base [&_h1]:tracking-[-0.025em] [&_p]:m-0 [&_p]:max-w-190 [&_p]:text-[10px] [&_p]:leading-[1.45] [&_p]:text-[var(--muted)] max-[940px]:[&_p]:hidden";

export const REVIEW_HEADER_STATUS_CLASS =
  "review-header-status flex shrink-0 items-center gap-3.5 [&>span]:grid [&>span]:gap-0.5 [&>span]:text-right [&>span]:font-[var(--font-mono)] [&>span]:text-[9px] [&>span]:text-[var(--muted)] [&>span]:uppercase [&_strong]:text-[13px] [&_strong]:text-[var(--text)] max-[940px]:[&>span]:hidden";

const REVIEW_OVERVIEW_BASE =
  "review-work-overview grid min-h-16.5 shrink-0 grid-cols-[minmax(260px,1fr)_auto_minmax(132px,0.24fr)] items-stretch overflow-hidden rounded-none border border-x-0 border-[color-mix(in_srgb,var(--border)_76%,transparent)] bg-transparent shadow-[inset_2px_0_var(--border-strong)] max-[1180px]:grid-cols-[minmax(280px,1fr)_auto] max-[860px]:grid-cols-[minmax(0,1fr)_auto]";

export function reviewOverviewClass(tone: string, empty: boolean): string {
  const toneClass =
    tone === "good"
      ? "good shadow-[inset_2px_0_var(--good)]"
      : tone === "warn"
        ? "warn shadow-[inset_2px_0_var(--warn)]"
        : tone === "bad"
          ? "bad shadow-[inset_2px_0_var(--bad)]"
          : "neutral";
  const emptyClass = empty
    ? "is-empty mt-[clamp(12px,6vh,72px)] min-h-22 w-[min(100%,920px)] self-center grid-cols-[minmax(0,1fr)] rounded-[var(--radius-sm)] border-x border-l-2 border-l-[var(--border-strong)] bg-[color-mix(in_srgb,var(--surface)_90%,var(--bg))] max-[1180px]:grid-cols-[minmax(0,1fr)] max-[860px]:grid-cols-[minmax(0,1fr)]"
    : "";
  return `${REVIEW_OVERVIEW_BASE} ${toneClass} ${emptyClass}`;
}

export const REVIEW_WORK_OUTCOME_CLASS =
  "review-work-outcome flex min-w-0 items-center gap-2.25 px-3 py-2 [.is-empty_&]:px-4.5 [.is-empty_&]:py-4 [&>i]:grid [&>i]:size-6.25 [&>i]:shrink-0 [&>i]:place-items-center [&>i]:rounded-sm [&>i]:border [&>i]:border-[var(--border-strong)] [&>i]:bg-[var(--surface-soft)] [&>i]:font-[var(--font-mono)] [&>i]:text-[11px] [&>i]:font-extrabold [&>i]:not-italic [.good_&>i]:border-[color-mix(in_srgb,var(--good)_32%,var(--border))] [.good_&>i]:bg-[var(--good-soft)] [.good_&>i]:text-[var(--good)] [.warn_&>i]:border-[color-mix(in_srgb,var(--warn)_32%,var(--border))] [.warn_&>i]:bg-[var(--warn-soft)] [.warn_&>i]:text-[var(--warn)] [.bad_&>i]:border-[color-mix(in_srgb,var(--bad)_32%,var(--border))] [.bad_&>i]:bg-[var(--bad-soft)] [.bad_&>i]:text-[var(--bad)] [&>span]:grid [&>span]:min-w-0 [&>span]:gap-0.5 [&_small]:font-[var(--font-mono)] [&_small]:text-[8px] [&_small]:font-bold [&_small]:tracking-[0.12em] [&_small]:text-[var(--faint)] [&_small]:uppercase [&_strong]:text-xs [&_strong]:tracking-[-0.01em] [&_p]:m-0 [&_p]:truncate [&_p]:text-[9px] [&_p]:leading-[1.4] [&_p]:text-[var(--muted)]";

export const REVIEW_WORK_METRICS_CLASS =
  "review-work-metrics m-0 grid min-w-85 grid-cols-4 border-[var(--border)] border-x max-[860px]:min-w-0 max-[860px]:border-x-0 max-[860px]:border-t max-[620px]:grid-cols-2 [&>div]:grid [&>div]:min-w-16 [&>div]:content-center [&>div]:gap-0.75 [&>div]:border-[var(--border)] [&>div]:border-r [&>div]:px-2.25 [&>div]:py-1.75 [&>div]:text-center [&>div:last-child]:border-r-0 max-[620px]:[&>div:nth-child(2)]:border-r-0 max-[620px]:[&>div:nth-child(-n+2)]:border-b [&_dt]:font-[var(--font-mono)] [&_dt]:text-[8px] [&_dt]:text-[var(--faint)] [&_dt]:uppercase [&_dd]:m-0 [&_dd]:font-[var(--font-mono)] [&_dd]:text-[13px] [&_dd]:font-[750] [&_dd]:text-[var(--text-soft)] [&_.warn_dd]:text-[var(--warn)]";

export const REVIEW_WORK_REVISION_CLASS =
  "review-work-revision grid min-w-0 content-center gap-0.75 px-3 py-2 max-[1180px]:hidden [&_small]:font-[var(--font-mono)] [&_small]:text-[8px] [&_small]:font-bold [&_small]:tracking-[0.12em] [&_small]:text-[var(--faint)] [&_small]:uppercase [&_strong]:truncate [&_strong]:text-[11px] [&_code]:truncate [&_code]:text-[9px] [&_code]:text-[var(--faint)]";

export const REVIEW_EVIDENCE_DRAWER_CLASS =
  "review-evidence-drawer group shrink-0 overflow-hidden rounded-none border-0 border-[var(--border)] border-y bg-transparent [&>summary]:flex [&>summary]:min-h-9 [&>summary]:cursor-pointer [&>summary]:list-none [&>summary]:items-center [&>summary]:justify-between [&>summary]:gap-3 [&>summary]:px-0.5 [&>summary]:py-1.75 [&>summary::-webkit-details-marker]:hidden [&>summary>span]:flex [&>summary>span]:min-w-0 [&>summary>span]:items-baseline [&>summary>span]:gap-2.25 [&>summary_strong]:text-[11px] [&>summary_strong]:text-[var(--text-soft)] [&>summary_small]:truncate [&>summary_small]:font-[var(--font-mono)] [&>summary_small]:text-[9px] [&>summary_small]:text-[var(--faint)]";

export const REVIEW_DISCLOSURE_ICON_CLASS =
  "text-[var(--muted)] not-italic transition-transform duration-140 group-open:rotate-90 motion-reduce:transition-none";

export const REVIEW_EVIDENCE_BODY_CLASS =
  "review-evidence-body grid max-h-[min(48vh,500px)] gap-2 overflow-auto border-[var(--border)] border-t bg-[var(--surface)] px-0 py-2 [&_.review-branch-record]:min-h-18.5 [&_.review-git-controls]:m-0";

export const REVIEW_WORKSPACE_CLASS =
  "review-workspace grid min-h-0 flex-1 grid-cols-[minmax(270px,300px)_minmax(0,1fr)] overflow-hidden border-0 border-[var(--border)] border-t bg-[var(--surface)] max-[860px]:grid-cols-[minmax(0,1fr)] max-[860px]:grid-rows-[minmax(220px,300px)_minmax(0,1fr)]";

export const REVIEW_RAIL_CLASS =
  "review-rail flex min-h-0 min-w-0 flex-col border-[var(--border)] border-r bg-[var(--surface)] max-[860px]:max-h-75 max-[860px]:border-r-0 max-[860px]:border-b";

export const REVIEW_TABS_CLASS =
  "review-tabs grid grid-cols-4 gap-0 border-[color-mix(in_srgb,var(--border)_72%,transparent)] border-b bg-[var(--surface)] px-1.25 pt-1 pb-0 max-[620px]:grid-cols-[repeat(4,minmax(82px,1fr))] max-[620px]:overflow-x-auto";

export const REVIEW_TAB_CLASS =
  "relative flex min-h-8 items-center justify-start gap-1 rounded-t-[var(--radius-xs)] border-0 bg-transparent px-2 py-1.5 font-[var(--font-mono)] text-[8px] font-bold tracking-[0.06em] text-[var(--muted)] uppercase whitespace-nowrap hover:bg-[var(--surface-hover)] hover:text-[var(--text)] [&>span]:font-[var(--font-mono)] [&>span]:text-[8px] [&>span]:text-[var(--faint)]";

export const REVIEW_TAB_SELECTED_CLASS =
  "selected bg-[var(--surface-hover)] text-[var(--text)] after:absolute after:right-2 after:bottom-[-1px] after:left-2 after:h-0.5 after:bg-[var(--accent)] after:content-['']";

export const REVIEW_SEARCH_CLASS =
  "review-search mx-1.5 my-1.25 grid min-h-8.5 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-[3px] border border-[color-mix(in_srgb,var(--border)_76%,transparent)] bg-[var(--bg)] px-2.25 text-[var(--faint)] focus-within:border-[var(--border-strong)] focus-within:text-[var(--text-soft)] [&_input]:h-8.75 [&_input]:w-full [&_input]:border-0 [&_input]:bg-transparent [&_input]:p-0 [&_input]:text-[11px] [&_input]:text-[var(--text)] [&_input]:outline-none [&_button]:size-5.5 [&_button]:rounded-[var(--radius-xs)] [&_button]:border-0 [&_button]:bg-transparent [&_button]:p-0 [&_button]:text-[15px] [&_button]:text-[var(--muted)] [&_button:hover]:bg-[var(--surface-hover)] [&_button:hover]:text-[var(--text)] [&_kbd]:text-[9px] [&_kbd]:text-[var(--faint)]";

export const REVIEW_LIST_CLASS =
  "review-list min-h-0 flex-1 overflow-auto px-1 pt-0 pb-1.5 [scrollbar-gutter:stable]";

export const REVIEW_LIST_BUTTON_CLASS =
  "grid min-h-13 w-full grid-cols-[24px_minmax(0,1fr)_auto] items-start gap-2.25 rounded-none border border-transparent border-b-[color-mix(in_srgb,var(--border)_72%,transparent)] bg-transparent px-1.75 py-2 text-left text-[var(--text-soft)] hover:border-x-transparent hover:border-t-transparent hover:bg-[var(--surface-hover)] hover:text-[var(--text)]";

export const REVIEW_LIST_BUTTON_SELECTED_CLASS =
  "selected border-x-transparent border-t-transparent bg-[color-mix(in_srgb,var(--accent)_7%,var(--surface-hover))] text-[var(--text)] shadow-[inset_3px_0_var(--accent)]";

const REVIEW_KIND_MARK_BASE =
  "review-kind-mark grid size-5.75 place-items-center rounded-[var(--radius-xs)] border font-[var(--font-mono)] text-[11px] font-extrabold";

export function reviewKindMarkClass(kind: string, status: string): string {
  if (kind === "changes")
    return `${REVIEW_KIND_MARK_BASE} changes border-[var(--border-strong)] bg-[var(--surface-soft)] text-[var(--text-soft)]`;
  if (kind === "runs")
    return `${REVIEW_KIND_MARK_BASE} runs border-[color-mix(in_srgb,var(--good)_35%,var(--border))] bg-[var(--good-soft)] text-[var(--good)]`;
  if (kind === "ci" && status === "good")
    return `${REVIEW_KIND_MARK_BASE} ci good border-[color-mix(in_srgb,var(--good)_35%,var(--border))] bg-[var(--good-soft)] text-[var(--good)]`;
  if (kind === "ci" && status === "warn")
    return `${REVIEW_KIND_MARK_BASE} ci warn border-[color-mix(in_srgb,var(--warn)_35%,var(--border))] bg-[color-mix(in_srgb,var(--warn)_10%,var(--surface-soft))] text-[var(--warn)]`;
  if (kind === "ci" && status === "bad")
    return `${REVIEW_KIND_MARK_BASE} ci bad border-[color-mix(in_srgb,var(--bad)_35%,var(--border))] bg-[var(--bad-soft)] text-[var(--bad)]`;
  return `${REVIEW_KIND_MARK_BASE} ${kind} ${status} border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]`;
}

export const REVIEW_LIST_COPY_CLASS =
  "review-list-copy grid min-w-0 gap-0.5 [&_strong]:truncate [&_strong]:text-xs [&_small]:truncate [&_small]:text-[10px] [&_small]:text-[var(--muted)] [&_time]:font-[var(--font-mono)] [&_time]:text-[8px] [&_time]:text-[var(--faint)]";

export const REVIEW_DETAIL_CLASS =
  "review-detail min-h-0 min-w-0 overflow-auto bg-[var(--bg)] px-5.5 pt-4.5 pb-6 [scrollbar-gutter:stable]";

export const REVIEW_DETAIL_HEADER_CLASS =
  "review-detail-header flex max-w-245 items-start justify-between gap-5 border-[color-mix(in_srgb,var(--border)_72%,transparent)] border-b pb-3 [&>div]:min-w-0 [&>div>span]:font-[var(--font-mono)] [&>div>span]:text-[10px] [&>div>span]:font-bold [&>div>span]:tracking-[0.1em] [&>div>span]:text-[var(--accent)] [&>div>span]:uppercase [&_h2]:mt-1.25 [&_h2]:mb-1 [&_h2]:font-[var(--font-display)] [&_h2]:text-[clamp(14px,1.1vw,17px)] [&_h2]:leading-[1.18] [&_h2]:[overflow-wrap:anywhere] [&_p]:m-0 [&_p]:max-w-175 [&_p]:text-xs [&_p]:leading-[1.55] [&_p]:text-[var(--muted)]";

export const REVIEW_DETAIL_BODY_CLASS = "grid max-w-245 gap-3.5 pt-4";

export const REVIEW_CI_HERO_CLASS =
  "review-ci-hero flex min-h-14.5 items-center justify-between gap-4.5 rounded-sm border border-[var(--accent-border)] bg-[color-mix(in_srgb,var(--accent)_5%,var(--surface-raised))] px-3.5 py-3 [&>div]:grid [&>div]:min-w-0 [&>div]:gap-1 [&_span]:font-[var(--font-mono)] [&_span]:text-[9px] [&_span]:font-bold [&_span]:tracking-[0.08em] [&_span]:text-[var(--accent)] [&_span]:uppercase [&_strong]:truncate [&_strong]:text-[13px] [&_a]:shrink-0 [&_a]:font-[var(--font-mono)] [&_a]:text-[9px] [&_a]:font-bold [&_a]:text-[var(--accent)] [&_a]:uppercase [&_a]:no-underline [&_a:hover]:underline [&_a:hover]:[text-underline-offset:3px]";

export const REVIEW_ADDITIONS_CLASS = "review-additions text-[var(--good)]";
export const REVIEW_DELETIONS_CLASS = "review-deletions text-[var(--bad)]";

export const REVIEW_CI_CHECKS_CLASS =
  "review-ci-checks overflow-hidden rounded-sm border border-[var(--border)] [&>div:first-child]:flex [&>div:first-child]:min-h-9 [&>div:first-child]:items-center [&>div:first-child]:justify-between [&>div:first-child]:border-[var(--border)] [&>div:first-child]:border-b [&>div:first-child]:bg-[var(--surface-raised)] [&>div:first-child]:px-2.75 [&>div:first-child]:py-1.75 [&>div:first-child>span]:font-[var(--font-mono)] [&>div:first-child>span]:text-[9px] [&>div:first-child>span]:font-bold [&>div:first-child>span]:tracking-[0.08em] [&>div:first-child>span]:text-[var(--accent)] [&>div:first-child>span]:uppercase [&>div:first-child>small]:font-[var(--font-mono)] [&>div:first-child>small]:text-[9px] [&>div:first-child>small]:text-[var(--muted)] [&_ul]:m-0 [&_ul]:grid [&_ul]:list-none [&_ul]:p-0 [&_li]:grid [&_li]:min-h-11.5 [&_li]:grid-cols-[7px_minmax(0,1fr)_auto_18px] [&_li]:items-center [&_li]:gap-2.5 [&_li]:border-[var(--border)] [&_li]:border-b [&_li]:px-2.75 [&_li]:py-2 [&_li:last-child]:border-b-0 [&_li>i]:size-1.5 [&_li>i]:rounded-full [&_li>i]:bg-[var(--muted)] [&_li>i.good]:bg-[var(--good)] [&_li>i.warn]:bg-[var(--warn)] [&_li>i.bad]:bg-[var(--bad)] [&_li>span]:grid [&_li>span]:min-w-0 [&_li>span]:gap-0.5 [&_li_strong]:truncate [&_li_strong]:text-[11px] [&_li_strong]:text-[var(--text-soft)] [&_li_small]:truncate [&_li_small]:text-[9px] [&_li_small]:text-[var(--muted)] [&_li>a]:text-[var(--accent)] [&_li>a]:no-underline";

export const REVIEW_COMMAND_CLASS =
  "review-command grid gap-2 [&>span]:font-[var(--font-mono)] [&>span]:text-[10px] [&>span]:font-bold [&>span]:tracking-[0.1em] [&>span]:text-[var(--accent)] [&>span]:uppercase [&_code]:m-0 [&_code]:overflow-auto [&_code]:whitespace-pre-wrap [&_code]:rounded-[var(--radius-sm)] [&_code]:border [&_code]:border-[var(--canvas-border)] [&_code]:bg-[var(--canvas-bg)] [&_code]:px-4 [&_code]:py-3.5 [&_code]:text-xs [&_code]:leading-[1.55] [&_code]:text-[var(--canvas-text)]";

export const REVIEW_FACTS_CLASS =
  "review-facts m-0 grid grid-cols-2 rounded-[var(--radius-sm)] border border-[var(--border)] max-[760px]:grid-cols-1 [&>div]:grid [&>div]:gap-1.25 [&>div]:border-[var(--border)] [&>div]:border-r [&>div]:border-b [&>div]:px-3.5 [&>div]:py-3 [&>div:nth-child(2n)]:border-r-0 [&>div:nth-last-child(-n+2)]:border-b-0 max-[760px]:[&>div]:border-r-0 max-[760px]:[&>div:nth-last-child(2)]:border-b [&_dt]:font-[var(--font-mono)] [&_dt]:text-[10px] [&_dt]:text-[var(--muted)] [&_dt]:uppercase [&_dd]:m-0 [&_dd]:text-xs [&_dd]:text-[var(--text-soft)] [&_dd]:[overflow-wrap:anywhere]";

export const REVIEW_ACTIONS_CLASS =
  "review-actions flex items-center gap-2.25 pt-0.75 max-[760px]:items-stretch max-[760px]:flex-col [&_small]:ml-2 [&_small]:max-w-105 [&_small]:text-[10px] [&_small]:leading-[1.45] [&_small]:text-[var(--muted)] max-[760px]:[&_small]:mt-1 max-[760px]:[&_small]:ml-0";

export const REVIEW_PATCH_CLASS =
  "review-patch mt-3 flex min-h-90 flex-col overflow-hidden rounded-[var(--radius-sm)] border border-[var(--canvas-border)] bg-[var(--canvas-bg)] [&>.loading-block]:m-auto [&>.loading-block]:text-[var(--canvas-text-soft)] [&>.empty-block]:m-auto [&>.empty-block]:text-[var(--canvas-text)] [&>.empty-block_p]:text-[var(--canvas-text-soft)] [&>.notice]:m-auto [&>pre]:m-0 [&>pre]:flex-1 [&>pre]:overflow-auto [&>pre]:py-3.25 [&>pre]:text-xs [&>pre]:leading-[1.6] [&>pre]:text-[var(--canvas-text-soft)] [&>pre>code]:block [&>pre>code]:min-w-max";

export const REVIEW_DETAIL_TOOLBAR_CLASS =
  "review-detail-toolbar flex min-h-10.5 items-center justify-between gap-4 border-[var(--border)] border-b bg-[var(--surface-raised)] px-3 py-1.75 [&>span]:truncate [&>span]:font-[var(--font-mono)] [&>span]:text-[10px] [&>span]:text-[var(--muted)] [&>div]:flex [&>div]:shrink-0 [&>div]:items-center [&>div]:gap-1.5 [&>div_button]:min-h-6.75 [&>div_button]:px-2 [&>div_button]:py-1.25 [&>div_button]:text-[10px]";

const REVIEW_PATCH_LINE_BASE =
  "review-patch-line grid min-h-[1.6em] grid-cols-[28px_minmax(max-content,1fr)] pr-4.75 whitespace-pre [&>button]:sticky [&>button]:left-0 [&>button]:grid [&>button]:h-[1.6em] [&>button]:w-5.75 [&>button]:place-items-center [&>button]:border-0 [&>button]:border-r [&>button]:border-r-transparent [&>button]:bg-[color-mix(in_srgb,var(--canvas-bg)_88%,transparent)] [&>button]:p-0 [&>button]:font-[var(--font-mono)] [&>button]:text-[11px] [&>button]:leading-none [&>button]:font-bold [&>button]:text-[var(--canvas-text)] [&>button]:opacity-16 hover:[&>button]:border-r-[var(--accent-border)] hover:[&>button]:bg-[color-mix(in_srgb,var(--accent)_18%,var(--canvas-bg))] hover:[&>button]:opacity-100 [&>button:focus-visible]:border-r-[var(--accent-border)] [&>button:focus-visible]:bg-[color-mix(in_srgb,var(--accent)_18%,var(--canvas-bg))] [&>button:focus-visible]:opacity-100 [&>button.has-comment]:border-r-[var(--accent-border)] [&>button.has-comment]:bg-[color-mix(in_srgb,var(--accent)_18%,var(--canvas-bg))] [&>button.has-comment]:opacity-100 [&>button.has-comment]:after:absolute [&>button.has-comment]:after:top-0.75 [&>button.has-comment]:after:right-0.75 [&>button.has-comment]:after:size-1 [&>button.has-comment]:after:rounded-full [&>button.has-comment]:after:bg-[var(--accent)] [&>button.has-comment]:after:content-[''] [&>.review-patch-gutter]:sticky [&>.review-patch-gutter]:left-0 [&>.review-patch-gutter]:grid [&>.review-patch-gutter]:h-[1.6em] [&>.review-patch-gutter]:w-5.75 [&>.review-patch-gutter]:place-items-center";

export function reviewPatchLineClass(kind: string): string {
  if (kind === "addition")
    return `${REVIEW_PATCH_LINE_BASE} addition bg-[color-mix(in_srgb,var(--good)_9%,transparent)] text-[var(--canvas-text)]`;
  if (kind === "deletion")
    return `${REVIEW_PATCH_LINE_BASE} deletion bg-[color-mix(in_srgb,var(--bad)_9%,transparent)] text-[var(--canvas-text)]`;
  if (kind === "hunk")
    return `${REVIEW_PATCH_LINE_BASE} hunk bg-[color-mix(in_srgb,var(--accent)_16%,var(--canvas-bg))] text-[var(--canvas-text)]`;
  if (kind === "meta")
    return `${REVIEW_PATCH_LINE_BASE} meta text-[var(--canvas-text-soft)]`;
  return `${REVIEW_PATCH_LINE_BASE} text-[var(--canvas-text-soft)]`;
}

export const REVIEW_PATCH_GUTTER_CLASS = "review-patch-gutter";

export const REVIEW_FEEDBACK_CLASS =
  "review-feedback group block border-[var(--border)] border-b bg-[linear-gradient(110deg,color-mix(in_srgb,var(--accent)_5%,transparent),transparent_44%),var(--surface)] [&>summary]:flex [&>summary]:min-h-8.5 [&>summary]:cursor-pointer [&>summary]:list-none [&>summary]:items-center [&>summary]:justify-between [&>summary]:gap-3 [&>summary]:px-3 [&>summary]:py-1.5 [&>summary]:text-[var(--text)] [&>summary::-webkit-details-marker]:hidden [&>summary>span]:flex [&>summary>span]:items-baseline [&>summary>span]:gap-2 [&>summary_strong]:text-[11px] [&>summary_strong]:font-[750] [&>summary_small]:font-[var(--font-mono)] [&>summary_small]:text-[9px] [&>summary_small]:font-medium [&>summary_small]:text-[var(--muted)]";

export const REVIEW_FEEDBACK_ICON_CLASS =
  "text-[var(--muted)] not-italic transition-transform duration-140 group-open:rotate-180 motion-reduce:transition-none";

export const REVIEW_FEEDBACK_BODY_CLASS =
  "review-feedback__body grid gap-2 border-[var(--border)] border-t px-3 pt-2 pb-2.5";

export const REVIEW_FEEDBACK_ACTIONS_CLASS =
  "review-feedback__actions flex items-center justify-end gap-1.5 [&_button]:min-h-6.75 [&_button]:px-2 [&_button]:py-1.25 [&_button]:text-[10px]";

export const REVIEW_COMMENT_LIST_CLASS =
  "review-comment-list m-0 grid max-h-52.5 list-none gap-1.75 overflow-auto p-0";

export const REVIEW_COMMENT_CLASS =
  "grid gap-1.5 rounded-[var(--radius-xs)] border border-[var(--border)] border-l-2 border-l-[var(--accent)] bg-[color-mix(in_srgb,var(--surface-raised)_92%,transparent)] px-2.5 py-2.25 [&_code]:truncate [&_code]:text-[10px] [&_code]:text-[var(--faint)] [&_p]:m-0 [&_p]:whitespace-pre-wrap [&_p]:text-[11px] [&_p]:leading-[1.5] [&_p]:text-[var(--text-soft)]";

export const REVIEW_COMMENT_RESOLVED_CLASS =
  "resolved border-l-[var(--border-strong)] opacity-68 [&_p]:line-through [&_p]:decoration-[var(--border-strong)]";

export const REVIEW_COMMENT_LOCATION_CLASS =
  "review-comment-location flex items-center justify-between gap-2.5 [&>span]:font-[var(--font-mono)] [&>span]:text-[9px] [&>span]:font-bold [&>span]:text-[var(--accent)] [&>span]:uppercase";

export const REVIEW_COMMENT_ACTIONS_CLASS =
  "review-comment-actions flex items-center justify-end gap-1.5 [&_button]:rounded-[var(--radius-xs)] [&_button]:border-0 [&_button]:bg-transparent [&_button]:px-1.25 [&_button]:py-0.5 [&_button]:text-[9px] [&_button]:text-[var(--muted)] [&_button:hover]:bg-[var(--surface-hover)] [&_button:hover]:text-[var(--text)] [&_button.danger:hover]:bg-[var(--bad-soft)] [&_button.danger:hover]:text-[var(--bad)]";

export const REVIEW_FEEDBACK_EMPTY_CLASS =
  "review-feedback-empty m-0 text-[10px] leading-[1.45] text-[var(--muted)] [&_strong]:text-[var(--accent)]";

export const REVIEW_COMMENT_EDITOR_CLASS =
  "review-comment-editor grid gap-1.75 rounded-[var(--radius-xs)] border border-[var(--accent-border)] bg-[var(--surface-raised)] p-2.5 shadow-[inset_2px_0_var(--accent)] [&>label]:text-[10px] [&>label]:font-bold [&>label]:text-[var(--text)] [&>code]:truncate [&>code]:text-[10px] [&>code]:text-[var(--faint)] [&>textarea]:min-h-16 [&>textarea]:w-full [&>textarea]:resize-y [&>textarea]:rounded-[var(--radius-xs)] [&>textarea]:border [&>textarea]:border-[var(--border-strong)] [&>textarea]:bg-[var(--surface)] [&>textarea]:px-2.25 [&>textarea]:py-2 [&>textarea]:text-[11px] [&>textarea]:leading-[1.5] [&>textarea]:text-[var(--text)] [&>textarea]:outline-none [&>textarea:focus]:border-[var(--accent-border)] [&>textarea:focus]:shadow-[0_0_0_2px_var(--accent-soft)] [&>small]:font-[var(--font-mono)] [&>small]:text-[9px] [&>small]:font-medium [&>small]:text-[var(--muted)] [&>div:last-child]:flex [&>div:last-child]:items-center [&>div:last-child]:justify-end [&>div:last-child]:gap-1.5 [&>div:last-child>small]:mr-auto [&_button]:min-h-6.75 [&_button]:px-2 [&_button]:py-1.25 [&_button]:text-[10px]";

export const REVIEW_DELETE_BACKDROP_CLASS =
  "fixed inset-0 z-150 grid place-items-center bg-[color-mix(in_srgb,var(--shadow)_70%,transparent)] p-4 backdrop-blur-[2px]";

export const REVIEW_DELETE_CONFIRMATION_CLASS =
  "review-delete-confirmation relative z-1 grid w-[min(440px,calc(100vw-32px))] gap-3 rounded-[var(--radius-md)] border border-[var(--bad)] bg-[var(--surface-raised)] p-5 text-[var(--text)] shadow-[var(--shell-shadow-lg)] [&_h3]:m-0 [&_p]:m-0 [&_p]:text-xs [&_p]:leading-[1.55] [&_p]:text-[var(--text-soft)] [&>div]:flex [&>div]:justify-end [&>div]:gap-2 [&_button]:min-h-8 [&_button]:rounded-[var(--radius-xs)] [&_button]:border [&_button]:border-[var(--border)] [&_button]:bg-[var(--surface)] [&_button]:px-3 [&_button]:py-1.5 [&_button.danger]:border-[var(--bad)] [&_button.danger]:bg-[var(--bad-soft)] [&_button.danger]:text-[var(--bad)]";

export const REVIEW_BRANCH_RECORD_CLASS =
  "review-branch-record grid min-h-18.5 shrink-0 grid-cols-[minmax(220px,0.72fr)_minmax(360px,1.15fr)_minmax(260px,1fr)] items-stretch overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface-raised)_90%,transparent)] shadow-[inset_2px_0_var(--accent)] max-[940px]:grid-cols-[minmax(210px,0.7fr)_minmax(300px,1fr)] max-[760px]:grid-cols-1";

export const REVIEW_BRANCH_HEADING_CLASS =
  "review-branch-record-heading flex min-w-0 flex-wrap content-center items-center gap-2.25 border-[var(--border)] border-r p-3 max-[760px]:border-r-0 max-[760px]:border-b [&_.eyebrow]:w-full [&_strong]:max-w-full [&_strong]:truncate [&_strong]:text-xs [&_strong]:text-[var(--text)] [&_code]:font-[var(--font-mono)] [&_code]:text-[10px] [&_code]:text-[var(--faint)]";

export const REVIEW_BRANCH_EVIDENCE_CLASS =
  "review-branch-evidence flex min-w-0 items-center justify-around gap-2.25 border-[var(--border)] border-r p-3 max-[760px]:border-r-0 max-[760px]:border-b [&_span]:grid [&_span]:gap-0.5 [&_span]:text-center [&_span]:text-[9px] [&_span]:text-[var(--muted)] [&_span]:uppercase [&_strong]:font-[var(--font-mono)] [&_strong]:text-sm [&_strong]:font-bold [&_strong]:text-[var(--text-soft)] [&_.bad_strong]:text-[var(--bad)] [&_.warn_strong]:text-[var(--warn)]";

export const REVIEW_BRANCH_EVENTS_CLASS =
  "review-branch-events m-0 grid min-w-0 list-none p-0 max-[940px]:hidden [&_li]:grid [&_li]:min-w-0 [&_li]:grid-cols-[auto_minmax(0,1fr)_auto] [&_li]:items-center [&_li]:gap-1.75 [&_li]:border-[color-mix(in_srgb,var(--border)_75%,transparent)] [&_li]:border-b [&_li]:px-2.5 [&_li]:py-1.25 [&_li:last-child]:border-b-0 [&_li>span]:font-[var(--font-mono)] [&_li>span]:text-[8px] [&_li>span]:font-bold [&_li>span]:text-[var(--accent)] [&_li>span]:uppercase [&_li>p]:m-0 [&_li>p]:truncate [&_li>p]:text-[10px] [&_li>p]:text-[var(--text-soft)] [&_li>time]:font-[var(--font-mono)] [&_li>time]:text-[9px] [&_li>time]:text-[var(--faint)] [&_li>time]:whitespace-nowrap [&_li.empty]:grid-cols-1 [&_li.empty>span]:text-[var(--muted)]";

export const REVIEW_GIT_CONTROLS_CLASS =
  "review-git-controls m-0 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] [&>summary]:cursor-pointer [&>summary]:px-3.5 [&>summary]:py-2.5 [&>summary]:text-xs [&>summary]:font-bold [&>summary]:tracking-[0.06em] [&>summary]:text-[var(--muted)] [&>summary]:uppercase";

export const BROWSER_PAGE_CLASS =
  "page h-full gap-2 overflow-hidden px-2.5 pt-2 pb-2.5 max-[1080px]:h-auto max-[1080px]:min-h-full max-[1080px]:overflow-auto";

export const BROWSER_HEADER_CLASS =
  "flex min-h-12 shrink-0 items-center justify-between gap-5 [&_h1]:mt-0.75 [&_h1]:mb-0.5 [&_h1]:font-[var(--font-display)] [&_h1]:text-base [&_h1]:tracking-[-0.025em] [&_p]:m-0 [&_p]:text-[10px] [&_p]:text-[var(--muted)] max-[780px]:[&_p]:hidden";

export const BROWSER_STATUS_CLASS =
  "grid grid-cols-[auto_auto_auto] items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] py-1 pr-1.5 pl-2 font-mono text-[10px] shadow-none [&>strong]:text-[var(--text-soft)] [&>strong]:uppercase";

export const BROWSER_ADDRESS_CLASS =
  "grid min-h-9.5 shrink-0 grid-cols-[auto_auto_auto_auto_minmax(0,1fr)_auto] items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface)] p-1 shadow-none";

export const BROWSER_NAV_BUTTON_CLASS =
  "size-8 rounded-[var(--radius-xs)] border-0 bg-transparent text-base text-[var(--muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40";

export const BROWSER_ADDRESS_INPUT_CLASS =
  "h-8 min-w-0 border-0 bg-transparent p-0 font-mono text-[11px] text-[var(--text)] outline-0 placeholder:text-[var(--muted)] focus-visible:ring-0";

export const BROWSER_WORKSPACE_CLASS =
  "grid min-h-0 flex-1 grid-cols-[minmax(520px,1fr)_minmax(300px,360px)] overflow-hidden rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface)] shadow-none max-[1080px]:min-h-0 max-[1080px]:flex-none max-[1080px]:grid-cols-1 max-[1080px]:overflow-visible";

export const BROWSER_CANVAS_CLASS =
  "flex min-h-0 min-w-0 flex-col border-[var(--border)] border-r bg-[var(--bg)] max-[1080px]:min-h-[clamp(15rem,48svh,22rem)] max-[1080px]:border-r-0 max-[1080px]:border-b";

export const BROWSER_CANVAS_TOOLBAR_CLASS =
  "grid min-h-9.75 grid-cols-[58px_minmax(0,1fr)_auto_auto] items-center gap-2.5 border-[var(--border)] border-b bg-[var(--surface-raised)] px-2.5 [&>div]:flex [&>div]:gap-1.25 [&>span:not(.badge)]:truncate [&>span:not(.badge)]:text-center [&>span:not(.badge)]:font-mono [&>span:not(.badge)]:text-[10px] [&>span:not(.badge)]:text-[var(--muted)]";

export const BROWSER_FRAME_STAGE_CLASS =
  "flex min-h-0 min-w-0 flex-1 justify-center overflow-auto bg-[var(--canvas-bg)] [&>iframe]:h-full [&>iframe]:w-full [&>iframe]:shrink-0 [&>iframe]:border-0 [&>iframe]:bg-white [&>iframe]:shadow-[0_0_0_1px_var(--canvas-border)]";

export const BROWSER_PREVIEW_WIDTH_CLASS = {
  responsive: "[&>iframe]:w-full",
  desktop: "[&>iframe]:w-[min(1440px,100%)]",
  tablet: "[&>iframe]:w-[min(768px,100%)]",
  mobile: "[&>iframe]:w-[min(390px,100%)]",
} as const;

export const BROWSER_PLACEHOLDER_CLASS =
  "grid max-w-[470px] place-items-center self-center justify-self-center gap-2.5 p-10 text-center [&>h2]:mt-1.25 [&>h2]:mb-0 [&>h2]:font-[var(--font-display)] [&>h2]:text-sm [&>p]:mt-0 [&>p]:mb-1.75 [&>p]:text-xs [&>p]:leading-[1.55] [&>p]:text-[var(--muted)]";

export const BROWSER_TOOLS_CLASS =
  "flex min-h-0 min-w-0 flex-col overflow-auto";

export const BROWSER_ACTIONS_CLASS =
  "grid grid-cols-2 gap-1.5 border-[var(--border)] border-b p-2.5";

export const BROWSER_ACTION_CLASS =
  "grid min-h-9.5 grid-cols-[minmax(0,1fr)_auto] content-center gap-2 rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--surface-soft)] px-2.25 py-1.75 text-left text-[var(--text-soft)] transition-colors hover:border-[var(--accent-border)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50 [&>i]:col-start-2 [&>i]:self-center [&>i]:not-italic [&>i]:text-[var(--accent)] [&>span]:text-[11px] [&>span]:font-extrabold";

export const BROWSER_COMPARE_SUMMARY_CLASS =
  "relative flex min-h-9.5 cursor-pointer list-none items-center justify-between gap-3 px-3.5 text-[11px] font-bold text-[var(--text-soft)] after:text-[var(--accent)] after:content-['+'] group-open:after:content-['−'] [&::-webkit-details-marker]:hidden [&_small]:ml-auto [&_small]:font-mono [&_small]:text-[9px] [&_small]:font-medium [&_small]:text-[var(--muted)] [&_small]:uppercase";

export const BROWSER_RESULT_SECTION_CLASS = "grid gap-2";

export const BROWSER_RESULT_HEADING_CLASS =
  "flex items-start justify-between gap-2.5 max-[780px]:grid max-[780px]:grid-cols-1";

export const BROWSER_RESULT_CARD_CLASS =
  "grid gap-1 rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--surface-soft)] p-2.5 [&>small]:text-[10px] [&>small]:leading-[1.45] [&>small]:text-[var(--muted)] [&>span]:font-mono [&>span]:text-[10px] [&>span]:text-[var(--muted)] [&>span]:uppercase [&>strong]:text-xs [&>strong]:text-[var(--text)]";

export const BROWSER_FIELD_CLASS =
  "grid gap-1.25 font-mono text-[10px] text-[var(--text-soft)]";

export const BROWSER_FIELD_CONTROL_CLASS =
  "box-border w-full rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--surface-raised)] font-mono text-[10px] text-[var(--text)] focus:border-[var(--accent)] focus:outline-0";

export const BROWSER_CODE_PREVIEW_CLASS =
  "m-0 max-h-60 overflow-auto whitespace-pre-wrap rounded-[var(--radius-xs)] border border-[var(--canvas-border)] bg-[var(--canvas-bg)] p-3 text-[10px] leading-normal text-[var(--canvas-text-soft)]";

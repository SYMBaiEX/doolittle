export const MCP_PANEL_CLASS =
  "grid gap-3.5 rounded-[5px] border border-[color-mix(in_srgb,var(--accent)_32%,var(--border))] bg-[radial-gradient(circle_at_12%_-10%,color-mix(in_srgb,var(--accent)_14%,transparent),transparent_38%),var(--surface-raised)] p-[18px]";

export const MCP_HEADER_CLASS =
  "flex items-start justify-between gap-4 max-[760px]:flex-col [&_h2]:mt-1 [&_h2]:mb-0 [&_h2]:font-[var(--font-display)] [&_h2]:text-sm [&_p]:mt-[7px] [&_p]:mb-0 [&_p]:max-w-[620px] [&_p]:text-[length:var(--text-body)] [&_p]:leading-[1.55] [&_p]:text-[var(--text-soft)]";

export const MCP_DISCLOSURE_CLASS =
  "group grid min-w-0 gap-0 rounded border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_76%,transparent)] p-[13px]";

export const MCP_SUMMARY_CLASS =
  "grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 [&::-webkit-details-marker]:hidden [&_h3]:mt-[3px] [&_h3]:mb-0 [&_h3]:text-[13px]";

export const MCP_DISCLOSURE_BODY_CLASS =
  "mt-[11px] grid gap-[11px] border-t border-[var(--border)] pt-[11px]";

export const MCP_TWO_COLUMN_CLASS =
  "grid grid-cols-[minmax(250px,0.9fr)_minmax(300px,1.1fr)] gap-2.5 max-[760px]:grid-cols-1";

export const MCP_TOOL_LIST_CLASS =
  "m-0 grid list-none content-start gap-1.5 p-0";

export const MCP_TOOL_BUTTON_CLASS =
  "grid w-full gap-1 rounded border border-[var(--border)] bg-[var(--surface-raised)] p-2.5 text-left text-inherit hover:border-[color-mix(in_srgb,var(--accent)_52%,var(--border))] hover:bg-[color-mix(in_srgb,var(--accent-soft)_55%,var(--surface-raised))] [&_code]:overflow-hidden [&_code]:text-ellipsis [&_code]:text-[11px] [&_code]:text-[var(--accent)] [&_small]:overflow-hidden [&_small]:text-ellipsis [&_small]:text-[11px] [&_small]:leading-[1.45] [&_small]:text-[var(--muted)] [&_span]:overflow-hidden [&_span]:text-ellipsis [&_span]:whitespace-nowrap [&_span]:text-[11px] [&_span]:leading-[1.45] [&_span]:text-[var(--text-soft)]";

export const MCP_TOOL_BUTTON_SELECTED_CLASS =
  "border-[color-mix(in_srgb,var(--accent)_52%,var(--border))] bg-[color-mix(in_srgb,var(--accent-soft)_55%,var(--surface-raised))]";

export const MCP_DETAIL_CLASS =
  "min-h-[142px] rounded border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface-raised)_86%,transparent)] p-3 [&>a]:w-fit [&>a]:text-xs [&>a]:text-[var(--accent)] [&>code]:my-[7px] [&>code]:block [&>code]:overflow-hidden [&>code]:text-ellipsis [&>code]:text-xs [&>code]:text-[var(--accent)] [&>p]:m-0 [&>p]:overflow-hidden [&>p]:text-ellipsis [&>p]:text-[11px] [&>p]:leading-[1.45] [&>p]:text-[var(--text-soft)] [&>small]:font-[var(--font-mono)] [&>small]:text-[10px] [&>small]:tracking-[0.05em] [&>small]:text-[var(--muted)] [&>small]:uppercase [&>pre]:mt-2.5 [&>pre]:max-h-[220px] [&>pre]:overflow-auto [&>pre]:whitespace-pre-wrap [&>pre]:rounded-[3px] [&>pre]:border [&>pre]:border-[var(--border)] [&>pre]:bg-[var(--surface)] [&>pre]:p-2.5 [&>pre]:text-[10px] [&>pre]:leading-[1.5] [&>pre]:text-[var(--text-soft)]";

export const MCP_SEARCH_CLASS = "flex gap-2 [&_input]:min-w-0 [&_input]:flex-1";

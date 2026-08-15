import type { ReactNode } from "react";

export function MediaOptions({
  children,
  label,
  value,
}: {
  children: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <details className="group col-span-full mb-[11px] overflow-hidden rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[color-mix(in_srgb,var(--surface-soft)_78%,transparent)]">
      <summary className="flex min-h-[34px] cursor-pointer list-none items-center justify-between gap-3 px-2.5 font-[var(--font-mono)] text-[var(--text-meta)] text-[var(--text-soft)] uppercase [&::-webkit-details-marker]:hidden">
        <span>{label}</span>
        <span className="ml-auto min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[9px] text-[var(--muted)]">
          {value}
        </span>
        <span
          aria-hidden="true"
          className="text-[var(--accent)] group-open:hidden"
        >
          +
        </span>
        <span
          aria-hidden="true"
          className="hidden text-[var(--accent)] group-open:inline"
        >
          −
        </span>
      </summary>
      <div className="grid grid-cols-2 gap-x-2.5 gap-y-0 border-t border-[var(--line-subtle)] px-2.5 pt-2.5 max-[760px]:grid-cols-1">
        {children}
      </div>
    </details>
  );
}

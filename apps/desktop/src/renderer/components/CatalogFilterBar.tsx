import type { ReactNode } from "react";

export function CatalogFilterBar({
  children,
  onQueryChange,
  placeholder,
  query,
  resultLabel,
  searchLabel,
}: {
  children?: ReactNode;
  onQueryChange: (value: string) => void;
  placeholder: string;
  query: string;
  resultLabel: string;
  searchLabel: string;
}) {
  return (
    <div className="catalog-filter-bar flex min-w-0 items-center gap-2 max-[760px]:flex-wrap max-[760px]:items-stretch">
      <label className="catalog-filter-bar__search min-w-[180px] flex-[1_1_320px] max-[760px]:basis-full">
        <span className="sr-only">{searchLabel}</span>
        <input
          className="min-h-[34px] w-full"
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={placeholder}
          type="search"
          value={query}
        />
      </label>
      {children ? (
        <div className="catalog-filter-bar__controls flex flex-[0_1_auto] gap-2 max-[760px]:min-w-0 max-[760px]:flex-[1_1_auto] max-[760px]:flex-wrap [&_select]:min-h-[34px] [&_select]:w-full [&_select]:min-w-[150px] max-[760px]:[&_select]:min-w-0 max-[760px]:[&_select]:flex-[1_1_150px]">
          {children}
        </div>
      ) : null}
      <output
        aria-live="polite"
        className="catalog-filter-bar__count flex-none whitespace-nowrap font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--muted)]"
      >
        {resultLabel}
      </output>
    </div>
  );
}

import type { ReactNode } from "react";
import "./catalog-filter-bar.css";

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
    <div className="catalog-filter-bar">
      <label className="catalog-filter-bar__search">
        <span className="sr-only">{searchLabel}</span>
        <input
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={placeholder}
          type="search"
          value={query}
        />
      </label>
      {children ? (
        <div className="catalog-filter-bar__controls">{children}</div>
      ) : null}
      <output aria-live="polite" className="catalog-filter-bar__count">
        {resultLabel}
      </output>
    </div>
  );
}

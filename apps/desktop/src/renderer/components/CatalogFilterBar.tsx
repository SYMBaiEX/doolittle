import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@doolittle/ui";
import { Search } from "lucide-react";
import { titleCase } from "../lib";
import { UiIcon } from "./UiIcon";
import "./catalog-browser.css";

export function CatalogFilterBar({
  category,
  onQueryChange,
  placeholder,
  query,
  resultLabel,
  searchLabel,
}: {
  category?: {
    label: string;
    options: readonly string[];
    value: string;
    onChange: (value: string) => void;
  };
  onQueryChange: (value: string) => void;
  placeholder: string;
  query: string;
  resultLabel: string;
  searchLabel: string;
}) {
  return (
    <div className="catalog-filter-bar">
      <div className="catalog-filter-bar__search">
        <UiIcon icon={Search} size="md" />
        <Input
          aria-label={searchLabel}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={placeholder}
          type="search"
          value={query}
        />
      </div>
      {category ? (
        <Select value={category.value} onValueChange={category.onChange}>
          <SelectTrigger
            aria-label={category.label}
            className="catalog-filter-bar__category"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {category.options.map((value) => (
              <SelectItem key={value} value={value}>
                {value === "all" ? "All categories" : titleCase(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      <output aria-live="polite" className="catalog-filter-bar__count">
        {resultLabel}
      </output>
    </div>
  );
}

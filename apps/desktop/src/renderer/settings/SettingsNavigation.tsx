import { SettingsMenu, type SettingsMenuItem } from "@doolittle/ui";

export type SettingsCategory = SettingsMenuItem;

export function SettingsNavigation({
  categories,
  category,
  onSelect,
  query = "",
  onQueryChange,
}: {
  categories: readonly SettingsCategory[];
  category: string;
  onSelect: (id: string) => void;
  query?: string;
  onQueryChange?: (query: string) => void;
}) {
  return (
    <SettingsMenu
      items={categories}
      value={category}
      onChange={onSelect}
      query={query}
      onQueryChange={onQueryChange}
    />
  );
}

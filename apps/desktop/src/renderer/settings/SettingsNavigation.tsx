import { SettingsMenu, type SettingsMenuItem } from "@doolittle/ui";
import {
  Activity,
  Brain,
  HelpCircle,
  Palette,
  ShieldCheck,
  UserRound,
  Wrench,
} from "lucide-react";
import { UiIcon } from "../components/UiIcon";
import {
  SETTINGS_SHELL_SECTIONS,
  type SettingsCategoryDefinition,
  type SettingsCategoryId,
  type SettingsShellSection,
  settingsCategoryForSection,
} from "./settings-sections";

export type SettingsCategory = SettingsMenuItem;

export function SettingsNavigation({
  categories,
  category,
  onSelect,
  query = "",
  onQueryChange,
  selections = {},
}: {
  categories: readonly SettingsCategoryDefinition[];
  category: string;
  onSelect: (id: string) => void;
  query?: string;
  onQueryChange?: (query: string) => void;
  selections?: Partial<Record<SettingsCategoryId, SettingsShellSection>>;
}) {
  const current = settingsCategoryForSection(category);
  const searching = !!query.trim();
  const icons = {
    general: Palette,
    intelligence: Brain,
    capabilities: Wrench,
    personalization: UserRound,
    execution: ShieldCheck,
    system: Activity,
    help: HelpCircle,
  };
  const categoryItems: SettingsMenuItem[] = categories.map((entry) => ({
    id: entry.id,
    label: entry.label,
    description: entry.description,
    icon: <UiIcon icon={icons[entry.id]} size="sm" />,
  }));
  const selectCategory = (id: string) => {
    const group = categories.find((entry) => entry.id === id);
    if (group) onSelect(selections[group.id] ?? group.defaultSection);
  };
  const items: SettingsMenuItem[] = searching
    ? SETTINGS_SHELL_SECTIONS.map((section) => ({
        ...section,
        group: settingsCategoryForSection(section.id).label,
      }))
    : categoryItems;
  return (
    <SettingsMenu
      items={items}
      value={searching ? category : current.id}
      onChange={(id) => {
        if (searching) onSelect(id);
        else selectCategory(id);
      }}
      query={query}
      onQueryChange={onQueryChange}
      pickerItems={categoryItems}
      pickerValue={current.id}
      onPickerChange={selectCategory}
    />
  );
}

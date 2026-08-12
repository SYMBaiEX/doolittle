export interface SettingsCategory {
  id: string;
  label: string;
  description: string;
}

export function SettingsNavigation({
  categories,
  category,
  onSelect,
}: {
  categories: SettingsCategory[];
  category: string;
  onSelect: (id: string) => void;
}) {
  return (
    <aside className="settings-nav" aria-label="Settings categories">
      {categories.map((entry) => (
        <button
          aria-label={`${entry.label}: ${entry.description}`}
          className={category === entry.id ? "selected" : ""}
          key={entry.id}
          onClick={() => onSelect(entry.id)}
          title={entry.description}
          aria-current={category === entry.id ? "page" : undefined}
          type="button"
        >
          <strong>{entry.label}</strong>
        </button>
      ))}
    </aside>
  );
}

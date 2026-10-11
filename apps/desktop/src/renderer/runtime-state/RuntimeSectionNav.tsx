import { TabsList, TabsTrigger } from "@elizaos/ui/components/ui/tabs";

export interface RuntimeSectionOption<Section extends string> {
  detail: string;
  id: Section;
  label: string;
}

export function RuntimeSectionNav<Section extends string>({
  ariaLabel,
  sections,
}: {
  ariaLabel: string;
  sections: readonly RuntimeSectionOption<Section>[];
}) {
  return (
    <TabsList
      aria-label={ariaLabel}
      className="runtime-section-nav flex h-auto w-full flex-wrap items-stretch gap-1 border-b border-[var(--line-subtle)] bg-transparent p-0"
    >
      {sections.map((section) => (
        <TabsTrigger
          aria-label={`${section.label}: ${section.detail}`}
          className="runtime-section-nav__item min-h-10 max-[720px]:min-h-11 min-w-0 rounded-xs border-0 bg-transparent px-2 py-1.5 text-[length:var(--text-control)] whitespace-normal break-words text-center leading-snug text-[var(--muted)] shadow-none focus-visible:z-1 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)] data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-[var(--text)] data-[state=active]:shadow-none"
          key={section.id}
          title={section.detail}
          value={section.id}
        >
          {section.label}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}

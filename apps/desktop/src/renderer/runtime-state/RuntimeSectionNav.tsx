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
      className="runtime-section-nav inline-grid h-auto w-fit max-w-full grid-flow-col auto-cols-[minmax(112px,auto)] gap-0 overflow-x-auto rounded-sm border border-[var(--line-subtle)] bg-[color-mix(in_srgb,var(--surface)_88%,transparent)] p-0.5 [scrollbar-width:none] max-[620px]:grid max-[620px]:w-full max-[620px]:auto-cols-[minmax(104px,1fr)] [&::-webkit-scrollbar]:hidden"
    >
      {sections.map((section) => (
        <TabsTrigger
          aria-label={`${section.label}: ${section.detail}`}
          className="runtime-section-nav__item min-h-[30px] min-w-0 rounded-xs border-0 border-r border-[var(--line-subtle)] bg-transparent px-[11px] py-[5px] font-[var(--font-mono)] text-[var(--text-meta)] font-bold tracking-[0.055em] whitespace-nowrap text-[var(--muted)] uppercase shadow-none last:border-r-0 focus-visible:z-1 focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-[var(--accent)] data-[state=active]:bg-[color-mix(in_srgb,var(--accent)_9%,var(--surface-raised))] data-[state=active]:text-[var(--text)] data-[state=active]:shadow-[inset_0_-1px_var(--accent)]"
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

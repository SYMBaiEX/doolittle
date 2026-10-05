import { TabsList, TabsTrigger } from "@elizaos/ui/components/ui/tabs";
import type { CSSProperties } from "react";

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
      className="runtime-section-nav grid h-auto w-full max-w-[760px] grid-cols-[repeat(var(--section-count),minmax(0,1fr))] max-[720px]:grid-cols-2 gap-0 overflow-hidden rounded-sm border border-[var(--line-subtle)] bg-[var(--surface)] p-0.5"
      style={{ "--section-count": sections.length } as CSSProperties}
    >
      {sections.map((section) => (
        <TabsTrigger
          aria-label={`${section.label}: ${section.detail}`}
          className="runtime-section-nav__item min-h-10 max-[720px]:min-h-11 min-w-0 rounded-xs border-0 bg-transparent px-2 py-1.5 text-[length:var(--text-control)] whitespace-normal break-words text-center leading-snug text-[var(--muted)] shadow-none focus-visible:z-1 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)] data-[state=active]:bg-[var(--surface-raised)] data-[state=active]:text-[var(--text)] data-[state=active]:shadow-[inset_0_-1px_var(--accent)]"
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

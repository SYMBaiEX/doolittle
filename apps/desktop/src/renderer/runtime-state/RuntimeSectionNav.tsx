import { TabsList, TabsTrigger } from "@elizaos/ui/components/ui/tabs";
import "./runtime-section-nav.css";

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
    <TabsList aria-label={ariaLabel} className="runtime-section-nav">
      {sections.map((section) => (
        <TabsTrigger
          aria-label={`${section.label}: ${section.detail}`}
          className="runtime-section-nav__item"
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

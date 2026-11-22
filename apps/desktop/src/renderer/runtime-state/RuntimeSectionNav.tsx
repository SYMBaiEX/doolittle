import { TabsList, TabsTrigger } from "@elizaos/ui/components/ui/tabs";
import type { LucideIcon } from "lucide-react";
import { UiIcon } from "../components/UiIcon";
import "./diagnostic-workspace.css";

export interface RuntimeSectionOption<Section extends string> {
  detail: string;
  icon: LucideIcon;
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
          <UiIcon icon={section.icon} size="md" />
          <span>
            <strong>{section.label}</strong>
            <small>{section.detail}</small>
          </span>
        </TabsTrigger>
      ))}
    </TabsList>
  );
}

import { type KeyboardEvent, useRef, useState } from "react";
import { CatalogFilterBar } from "./components/CatalogFilterBar";
import { CompactCatalogList } from "./components/CompactCatalogList";
import { CompactStatStrip } from "./components/CompactStatStrip";
import { OfflineRouteState } from "./components/OfflineRouteState";
import { SkillWorkshopPanel } from "./components/SkillWorkshopPanel";
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  PageHeader,
  titleCase,
  useApiResource,
} from "./lib";
import "./agent-pages.css";
import "./catalog-pages.css";

interface SkillsResponse {
  skills?: unknown[];
  hub?: unknown;
  workspace?: unknown;
  summary?: Record<string, unknown>;
  installed?: unknown;
}

type SkillsSection = "catalog" | "workshop";
const SKILLS_SECTIONS: readonly SkillsSection[] = ["catalog", "workshop"];

export function skillsSectionForKey(
  current: SkillsSection,
  key: string,
): SkillsSection | undefined {
  const index = SKILLS_SECTIONS.indexOf(current);
  if (key === "ArrowLeft") {
    return SKILLS_SECTIONS[(index - 1 + SKILLS_SECTIONS.length) % 2];
  }
  if (key === "ArrowRight") {
    return SKILLS_SECTIONS[(index + 1) % SKILLS_SECTIONS.length];
  }
  if (key === "Home") return SKILLS_SECTIONS[0];
  if (key === "End") return SKILLS_SECTIONS.at(-1);
  return undefined;
}

export function SkillsPage({ active }: { active: boolean }) {
  const skills = useApiResource<SkillsResponse>(active ? "/skills" : null, [
    active,
  ]);
  const refresh = () => {
    if (active) skills.reload();
  };
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<SkillsSection>("catalog");
  const tabRefs = useRef<Record<SkillsSection, HTMLButtonElement | null>>({
    catalog: null,
    workshop: null,
  });
  if (!active) {
    return (
      <div className="page page-skills">
        <PageHeader
          actions={
            <button
              className="secondary-button"
              disabled
              onClick={refresh}
              type="button"
            >
              Refresh
            </button>
          }
          description="Browse reusable skills or review proposals before activation."
          eyebrow="Agent"
          title="Skills"
        />
        <OfflineRouteState>
          Skill catalog and proposal review are unavailable until the local
          runtime is ready.
        </OfflineRouteState>
      </div>
    );
  }
  const entries = asArray(skills.data?.skills).map(asRecord);
  const filtered = entries.filter((entry) => {
    const normalized = query.trim().toLowerCase();
    return (
      !normalized ||
      [entry.slug, entry.name, entry.description, entry.category]
        .join(" ")
        .toLowerCase()
        .includes(normalized)
    );
  });
  const catalogEntries = filtered.map((entry, index) => {
    const slug = asString(entry.slug, asString(entry.id, `skill-${index}`));
    return {
      id: slug,
      eyebrow: titleCase(asString(entry.category, slug.split("/")[0])),
      title: asString(entry.name, titleCase(slug)),
      description: asString(
        entry.description,
        "A locally available Doolittle skill.",
      ),
      descriptionMode: "details" as const,
      code: slug,
    };
  });
  const summaryValue = skills.data?.summary ?? {};
  const installedValues = asArray(skills.data?.installed);
  const selectSectionWithKeyboard = (
    event: KeyboardEvent<HTMLButtonElement>,
  ) => {
    const target = skillsSectionForKey(section, event.key);
    if (!target) return;
    event.preventDefault();
    setSection(target);
    requestAnimationFrame(() => tabRefs.current[target]?.focus());
  };

  return (
    <div className="page page-skills">
      <PageHeader
        eyebrow="Agent"
        title="Skills"
        description="Browse reusable skills or review proposals before activation."
        actions={
          <button
            className="secondary-button"
            disabled={!active}
            onClick={refresh}
            type="button"
          >
            Refresh
          </button>
        }
      />
      <CompactStatStrip
        label="Skill catalog summary"
        stats={[
          {
            label: "Available",
            value: asNumber(summaryValue.total, entries.length),
          },
          { label: "Curated", value: asNumber(summaryValue.curated) },
          { label: "Generated", value: asNumber(summaryValue.generated) },
          {
            label: "Installed",
            value: installedValues.length,
            tone: "good",
          },
        ]}
      />
      <div
        aria-label="Skills views"
        className="skills-page-switcher"
        role="tablist"
      >
        <button
          aria-controls="skills-catalog-panel"
          aria-selected={section === "catalog"}
          id="skills-catalog-tab"
          onClick={() => setSection("catalog")}
          onKeyDown={selectSectionWithKeyboard}
          ref={(node) => {
            tabRefs.current.catalog = node;
          }}
          role="tab"
          tabIndex={section === "catalog" ? 0 : -1}
          type="button"
        >
          <span>Catalog</span>
        </button>
        <button
          aria-controls="skills-workshop-panel"
          aria-selected={section === "workshop"}
          id="skills-workshop-tab"
          onClick={() => setSection("workshop")}
          onKeyDown={selectSectionWithKeyboard}
          ref={(node) => {
            tabRefs.current.workshop = node;
          }}
          role="tab"
          tabIndex={section === "workshop" ? 0 : -1}
          type="button"
        >
          <span>Workshop</span>
        </button>
      </div>
      <section
        aria-labelledby="skills-catalog-tab"
        className="skills-page-catalog"
        hidden={section !== "catalog"}
        id="skills-catalog-panel"
        role="tabpanel"
      >
        {section === "catalog" ? (
          <>
            <CatalogFilterBar
              onQueryChange={setQuery}
              placeholder="Search skills"
              query={query}
              resultLabel={
                skills.loading
                  ? "Loading…"
                  : skills.error
                    ? "Unavailable"
                    : `${filtered.length} of ${entries.length}`
              }
              searchLabel="Search skills"
            />
            {skills.loading ? (
              <LoadingBlock label="Reading workspace skills…" />
            ) : skills.error ? (
              <ErrorBlock error={skills.error} retry={skills.reload} />
            ) : filtered.length ? (
              <CompactCatalogList
                ariaLabel="Skill catalog"
                entries={catalogEntries}
                resetKey={query.trim().toLowerCase()}
              />
            ) : (
              <EmptyBlock density="compact" title="No skills match">
                Change the search, or add skills to the local skill workspace.
              </EmptyBlock>
            )}
          </>
        ) : null}
      </section>
      <div
        aria-labelledby="skills-workshop-tab"
        className="skills-page-workshop"
        hidden={section !== "workshop"}
        id="skills-workshop-panel"
        role="tabpanel"
      >
        {section === "workshop" ? <SkillWorkshopPanel active={active} /> : null}
      </div>
    </div>
  );
}

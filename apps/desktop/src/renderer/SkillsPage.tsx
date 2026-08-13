import {
  type KeyboardEvent,
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
} from "react";
import type { SkillsResponse } from "../shared/contracts";
import { buildSkillCatalogEntries } from "./catalog-entry-models";
import { CatalogFilterBar } from "./components/CatalogFilterBar";
import { CompactStatStrip } from "./components/CompactStatStrip";
import { OfflineRouteState } from "./components/OfflineRouteState";
import { ResourceStatusBar } from "./components/ResourceStatusBar";
import {
  asArray,
  asNumber,
  asRecord,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  PageHeader,
  useApiResource,
} from "./lib";
import { SkillCatalogWorkspace } from "./skills/SkillCatalogWorkspace";
import "./agent-pages.css";
import "./catalog-pages.css";

const LazySkillWorkshopPanel = lazy(async () => {
  const module = await import("./components/SkillWorkshopPanel");
  return { default: module.SkillWorkshopPanel };
});

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
  const cachedCatalog = useRef<SkillsResponse | null>(null);
  useEffect(() => {
    if (skills.data) cachedCatalog.current = skills.data;
  }, [skills.data]);
  const catalogData = skills.data ?? cachedCatalog.current;
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
  const entries = buildSkillCatalogEntries(
    asArray(catalogData?.skills).map(asRecord),
  );
  const filtered = entries.filter((entry) => {
    const normalized = query.trim().toLowerCase();
    return (
      !normalized ||
      [
        entry.slug,
        entry.title,
        entry.description,
        entry.family,
        entry.source,
        entry.commandName,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized)
    );
  });
  const summaryValue = catalogData?.summary ?? {};
  const installedValues = asArray(catalogData?.installed);
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
      <ResourceStatusBar
        resources={[{ label: "Skill catalog", resource: skills }]}
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
            {skills.loading && !catalogData ? (
              <LoadingBlock label="Reading workspace skills…" />
            ) : skills.error && !catalogData ? (
              <ErrorBlock error={skills.error} retry={skills.reload} />
            ) : filtered.length ? (
              <SkillCatalogWorkspace
                entries={filtered}
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
        {section === "workshop" ? (
          <Suspense fallback={<LoadingBlock label="Loading skill workshop…" />}>
            <LazySkillWorkshopPanel active={active} />
          </Suspense>
        ) : null}
      </div>
    </div>
  );
}

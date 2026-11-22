import { BookOpen, RefreshCw } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { SkillsResponse } from "../shared/contracts";
import { buildSkillCatalogEntries } from "./catalog-entry-models";
import { CatalogFilterBar } from "./components/CatalogFilterBar";
import { CompactStatStrip } from "./components/CompactStatStrip";
import { OfflineRouteState } from "./components/OfflineRouteState";
import { PanelTabs } from "./components/PanelTabs";
import { ResourceStatusBar } from "./components/ResourceStatusBar";
import {
  WorkbenchAction,
  WorkbenchEmpty,
  WorkbenchSection,
} from "./components/workbench/Workbench";
import {
  asArray,
  asNumber,
  asRecord,
  ErrorBlock,
  LoadingBlock,
  useApiResource,
} from "./lib";
import { SkillCatalogWorkspace } from "./skills/SkillCatalogWorkspace";

const LazySkillWorkshopPanel = lazy(async () => {
  const module = await import("./components/SkillWorkshopPanel");
  return { default: module.SkillWorkshopPanel };
});

const SKILLS_TABS = [
  { id: "catalog", label: "Catalog", panelId: "skills-catalog-panel" },
  { id: "workshop", label: "Workshop", panelId: "skills-workshop-panel" },
] as const;
type SkillsSection = (typeof SKILLS_TABS)[number]["id"];

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
  const [workshopOpened, setWorkshopOpened] = useState(false);
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
  return (
    <WorkbenchSection
      actions={
        <WorkbenchAction
          disabled={!active}
          emphasis="quiet"
          icon={RefreshCw}
          onClick={refresh}
        >
          Refresh
        </WorkbenchAction>
      }
      className="catalog-page"
      description="Find reusable workflows and review skill proposals in the workshop."
      icon={BookOpen}
      title="Skill catalog"
    >
      {active ? (
        <>
          <div className="catalog-overview">
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
          </div>
          <PanelTabs
            id="skills"
            items={SKILLS_TABS}
            label="Skills views"
            onSelect={(nextSection) => {
              if (nextSection === "workshop") setWorkshopOpened(true);
              setSection(nextSection);
            }}
            selected={section}
          />
          <section
            aria-labelledby="skills-catalog-tab"
            className="skills-page-catalog grid min-w-0 gap-3"
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
                  <WorkbenchEmpty
                    actions={
                      query.trim() ? (
                        <WorkbenchAction
                          emphasis="secondary"
                          onClick={() => setQuery("")}
                        >
                          Clear search
                        </WorkbenchAction>
                      ) : undefined
                    }
                    icon={BookOpen}
                    title={
                      query.trim() ? "No skills match" : "No skills reported"
                    }
                  >
                    {query.trim()
                      ? "Try a different skill name or command."
                      : "Add skills to the local skill workspace to browse them here."}
                  </WorkbenchEmpty>
                )}
              </>
            ) : null}
          </section>
          <div
            aria-labelledby="skills-workshop-tab"
            hidden={section !== "workshop"}
            id="skills-workshop-panel"
            role="tabpanel"
          >
            {workshopOpened ? (
              <Suspense
                fallback={<LoadingBlock label="Loading skill workshop…" />}
              >
                <LazySkillWorkshopPanel active={section === "workshop"} />
              </Suspense>
            ) : null}
          </div>
        </>
      ) : (
        <OfflineRouteState>
          Skill catalog and proposal review are unavailable until the local
          runtime is ready.
        </OfflineRouteState>
      )}
    </WorkbenchSection>
  );
}

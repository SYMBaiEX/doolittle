import { type KeyboardEvent, useState } from "react";
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

interface SkillsResponse {
  skills?: unknown[];
  hub?: unknown;
  workspace?: unknown;
  summary?: Record<string, unknown>;
  installed?: unknown;
}

export function SkillsPage({ active }: { active: boolean }) {
  const skills = useApiResource<SkillsResponse>(active ? "/skills" : null, [
    active,
  ]);
  const refresh = () => {
    if (active) skills.reload();
  };
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<"catalog" | "workshop">("catalog");
  if (!active) {
    return (
      <div className="page">
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
          description="Browse the skills Doolittle can load for specialized work and inspect the local skill hub."
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
    next: "catalog" | "workshop",
  ) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const target =
      event.key === "ArrowLeft" || event.key === "Home"
        ? "catalog"
        : event.key === "ArrowRight" || event.key === "End"
          ? "workshop"
          : next;
    setSection(target);
    requestAnimationFrame(() => {
      event.currentTarget.parentElement
        ?.querySelector<HTMLButtonElement>(
          `button[aria-selected="${String(target === "workshop")}"]`,
        )
        ?.focus();
    });
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Agent"
        title="Skills"
        description="Browse the skills Doolittle can load for specialized work and inspect the local skill hub."
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
          aria-selected={section === "catalog"}
          onClick={() => setSection("catalog")}
          onKeyDown={(event) => selectSectionWithKeyboard(event, "catalog")}
          role="tab"
          tabIndex={section === "catalog" ? 0 : -1}
          type="button"
        >
          <span>Catalog</span>
          <small>{entries.length} available</small>
        </button>
        <button
          aria-selected={section === "workshop"}
          onClick={() => setSection("workshop")}
          onKeyDown={(event) => selectSectionWithKeyboard(event, "workshop")}
          role="tab"
          tabIndex={section === "workshop" ? 0 : -1}
          type="button"
        >
          <span>Workshop</span>
          <small>Review before activation</small>
        </button>
      </div>
      {section === "catalog" ? (
        <>
          <div className="filter-bar">
            <label className="search-field grow">
              <span className="sr-only">Search skills</span>
              <input
                placeholder="Search skills"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>
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
            <EmptyBlock title="No skills match">
              Change the search, or add skills to the local skill workspace.
            </EmptyBlock>
          )}
        </>
      ) : (
        <div className="skills-page-workshop">
          <SkillWorkshopPanel active={active} />
        </div>
      )}
    </div>
  );
}

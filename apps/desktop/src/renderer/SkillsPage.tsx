import { type KeyboardEvent, useState } from "react";
import { SkillWorkshopPanel } from "./components/SkillWorkshopPanel";
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  Badge,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  MetricCard,
  PageHeader,
  titleCase,
  useApiResource,
} from "./lib";
import "./agent-pages.css";

interface SkillsResponse {
  skills?: unknown[];
  hub?: unknown;
  workspace?: unknown;
}

interface SkillsSummaryResponse {
  summary?: Record<string, unknown>;
  hub?: unknown;
  installed?: unknown;
}

export function SkillsPage({ active }: { active: boolean }) {
  const skills = useApiResource<SkillsResponse>(active ? "/skills" : null, [
    active,
  ]);
  const summary = useApiResource<SkillsSummaryResponse>(
    active ? "/skills/summary" : null,
    [active],
  );
  const installed = useApiResource<Record<string, unknown>>(
    active ? "/skills/installed" : null,
    [active],
  );
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<"catalog" | "workshop">("catalog");
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
  const summaryValue = summary.data?.summary ?? {};
  const installedValues = asArray(installed.data?.installed);
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
            onClick={skills.reload}
            type="button"
          >
            Refresh
          </button>
        }
      />
      <div className="metric-grid compact">
        <MetricCard
          label="Available"
          value={asNumber(summaryValue.total, entries.length)}
        />
        <MetricCard label="Curated" value={asNumber(summaryValue.curated)} />
        <MetricCard
          label="Generated"
          value={asNumber(summaryValue.generated)}
        />
        <MetricCard label="Installed" value={installedValues.length} />
      </div>
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
            <div className="card-grid dense">
              {filtered.map((entry, index) => {
                const slug = asString(
                  entry.slug,
                  asString(entry.id, `skill-${index}`),
                );
                return (
                  <article className="content-card catalog-card" key={slug}>
                    <div className="card-heading">
                      <div>
                        <span className="eyebrow">
                          {titleCase(
                            asString(entry.category, slug.split("/")[0]),
                          )}
                        </span>
                        <h2>{asString(entry.name, titleCase(slug))}</h2>
                      </div>
                      <Badge tone="good">Available</Badge>
                    </div>
                    <p>
                      {asString(
                        entry.description,
                        "A locally available Doolittle skill.",
                      )}
                    </p>
                    <div className="card-footer">
                      <code>{slug}</code>
                    </div>
                  </article>
                );
              })}
            </div>
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

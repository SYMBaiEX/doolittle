import { BookOpen } from "lucide-react";
import type { SkillCatalogItem } from "../catalog-entry-models";
import {
  CatalogBrowser,
  CatalogDetail,
  CatalogFacts,
  CatalogPolicy,
  CatalogStatus,
} from "../components/CatalogBrowser";
import { titleCase } from "../lib";

const SKILL_CATALOG_PAGE_SIZE = 12;

function invocationLabel(enabled: boolean): string {
  return enabled ? "Enabled" : "Not exposed";
}

export function SkillCatalogWorkspace({
  entries,
  resetKey,
}: {
  entries: readonly SkillCatalogItem[];
  resetKey: string;
}) {
  return (
    <CatalogBrowser
      getRow={(skill) => ({
        title: skill.title,
        meta: (
          <>
            <code>/{skill.commandName}</code>
            <span>{titleCase(skill.source)}</span>
          </>
        ),
        status:
          !skill.userInvocable && !skill.modelInvocable ? (
            <CatalogStatus tone="warn">Reference only</CatalogStatus>
          ) : undefined,
      })}
      icon={BookOpen}
      idPrefix="skill"
      items={entries}
      label="Skill catalog"
      listLabel="Skills"
      pageSize={SKILL_CATALOG_PAGE_SIZE}
      resetKey={resetKey}
    >
      {(skill) => {
        const invocationRestricted =
          !skill.userInvocable || !skill.modelInvocable;
        return (
          <>
            <CatalogDetail
              description={skill.description}
              icon={BookOpen}
              name={skill.title}
              status={
                <CatalogStatus tone={invocationRestricted ? "warn" : "good"}>
                  {invocationRestricted ? "Limited" : "Invocable"}
                </CatalogStatus>
              }
            />
            {invocationRestricted ? (
              <CatalogPolicy title="Invocation policy">
                Runtime policy limits how this skill can be invoked.
              </CatalogPolicy>
            ) : null}
            <CatalogFacts
              facts={[
                { label: "Command", value: <code>/{skill.commandName}</code> },
                { label: "Skill ID", value: <code>{skill.slug}</code> },
                { label: "Source", value: titleCase(skill.source) },
                { label: "Family", value: titleCase(skill.family) },
                {
                  label: "User command",
                  value: invocationLabel(skill.userInvocable),
                },
                {
                  label: "Model use",
                  value: invocationLabel(skill.modelInvocable),
                },
              ]}
            />
          </>
        );
      }}
    </CatalogBrowser>
  );
}

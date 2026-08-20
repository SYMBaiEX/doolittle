import type { SkillCatalogItem } from "../catalog-entry-models";
import type { PromptLibraryEntry } from "../conversation-persistence";

export interface ReusableCompletion {
  id: string;
  kind: "prompt" | "skill";
  label: string;
  description: string;
  insertText: string;
  scope: string;
}

function reusableQuery(draft: string): string | null {
  const trimmed = draft.trimStart();
  if (!trimmed.startsWith("$")) return null;
  return trimmed.slice(1).trim().toLowerCase();
}

export function reusableCompletions(
  draft: string,
  prompts: readonly PromptLibraryEntry[],
  skills: readonly SkillCatalogItem[],
  activeProjectId?: string,
  limit = 12,
): ReusableCompletion[] {
  const query = reusableQuery(draft);
  if (query === null) return [];
  const matches = (values: readonly string[]) =>
    !query || values.join(" ").toLowerCase().includes(query);

  const promptMatches = prompts
    .filter((entry) => !entry.projectId || entry.projectId === activeProjectId)
    .filter((entry) => matches([entry.title, entry.content]))
    .sort((left, right) => {
      const leftScoped = left.projectId === activeProjectId ? 1 : 0;
      const rightScoped = right.projectId === activeProjectId ? 1 : 0;
      return (
        rightScoped - leftScoped ||
        right.updatedAt.localeCompare(left.updatedAt)
      );
    })
    .map(
      (entry): ReusableCompletion => ({
        id: `prompt:${entry.id}`,
        kind: "prompt",
        label: entry.title,
        description: entry.content,
        insertText: entry.content,
        scope: entry.projectId ? "Project prompt" : "General prompt",
      }),
    );

  const skillMatches = skills
    .filter((skill) => skill.userInvocable)
    .filter((skill) =>
      matches([
        skill.title,
        skill.description,
        skill.slug,
        skill.commandName,
        skill.family,
      ]),
    )
    .map(
      (skill): ReusableCompletion => ({
        id: `skill:${skill.id}`,
        kind: "skill",
        label: skill.title,
        description: skill.description,
        insertText: `/${skill.commandName}`,
        scope: "Skill",
      }),
    );

  return [...promptMatches, ...skillMatches].slice(0, limit);
}

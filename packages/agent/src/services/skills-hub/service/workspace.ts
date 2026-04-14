import {
  buildSkillHubWorkspaceRecords,
  findSkillHubWorkspaceRecord,
} from "../records";
import type { SkillHubWorkspaceRecord } from "../types";
import type { SkillHubServiceContext } from "./context";

export function collectSkillHubWorkspace(
  context: Pick<SkillHubServiceContext, "skills" | "skillSynthesis" | "paths">,
): SkillHubWorkspaceRecord[] {
  return buildSkillHubWorkspaceRecords(
    context.skills,
    context.skillSynthesis,
    context.paths.manifestsDir,
  );
}

export function collectGeneratedWorkspaceSkills(
  workspace: SkillHubWorkspaceRecord[],
): SkillHubWorkspaceRecord[] {
  return workspace.filter((entry) => entry.source === "generated");
}

export function resolveWorkspaceSkill(
  workspace: SkillHubWorkspaceRecord[],
  slug: string,
): SkillHubWorkspaceRecord | undefined {
  return findSkillHubWorkspaceRecord(workspace, slug);
}

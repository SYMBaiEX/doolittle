import type { SkillHubFamilyRecord } from "../types";
import {
  buildCuratedFamilyRecord,
  buildGeneratedFamilyRecord,
} from "./builders";
import { readCuratedFamilies } from "./parsing";
import type { SkillHubFamilyInput } from "./types";

export function buildSkillHubFamilies(
  input: SkillHubFamilyInput,
): SkillHubFamilyRecord[] {
  const curated = readCuratedFamilies(
    input.familyIndexPath,
    input.familyReadmePath,
  );
  const generated = input.workspace.filter(
    (entry) => entry.source === "generated",
  );

  const families = curated.map((family) =>
    buildCuratedFamilyRecord(
      family,
      input.workspace,
      input.catalog,
      input.installed,
      input.skillsRootDir,
    ),
  );
  if (generated.length > 0) {
    families.push(
      buildGeneratedFamilyRecord(
        generated,
        input.catalog,
        input.installed,
        input.skillsRootDir,
      ),
    );
  }

  return families.sort(
    (left, right) =>
      right.workspaceTotal +
        right.generatedTotal +
        right.catalogTotal +
        right.installedTotal -
        (left.workspaceTotal +
          left.generatedTotal +
          left.catalogTotal +
          left.installedTotal) || left.slug.localeCompare(right.slug),
  );
}

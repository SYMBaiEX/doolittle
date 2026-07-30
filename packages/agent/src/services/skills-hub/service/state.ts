import type { SkillSynthesisService } from "../../skill-synthesis/service";
import type { SkillsService } from "../../skills/service";
import type {
  SkillHubCatalogRecord,
  SkillHubFamilyRecord,
  SkillHubInstalledRecord,
  SkillHubSyncReport,
} from "../types";
import type { SkillHubServiceContext } from "./context";
import { createSkillHubManifestHost } from "./host";
import { buildSkillHubServicePaths, ensureSkillHubServicePaths } from "./paths";

export interface SkillHubServiceCache {
  lastSyncReport?: SkillHubSyncReport;
  catalogProjected?: boolean;
  catalog?: SkillHubCatalogRecord[];
  installed?: SkillHubInstalledRecord[];
  families?: SkillHubFamilyRecord[];
}

export interface SkillHubServiceState {
  cache: SkillHubServiceCache;
  context: SkillHubServiceContext;
}

export function createSkillHubServiceState(input: {
  skills: SkillsService;
  skillSynthesis: SkillSynthesisService;
  baseDir: string;
}): SkillHubServiceState {
  const paths = buildSkillHubServicePaths(
    input.baseDir,
    input.skills.rootDir(),
  );
  ensureSkillHubServicePaths(paths);

  return {
    cache: {},
    context: {
      skills: input.skills,
      skillSynthesis: input.skillSynthesis,
      paths,
      manifestHost: createSkillHubManifestHost(paths),
    },
  };
}

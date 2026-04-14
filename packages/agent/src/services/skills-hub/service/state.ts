import type { AgentSdkService } from "../../agent-sdk-service";
import type { SkillSynthesisService } from "../../skill-synthesis/service";
import type { SkillsService } from "../../skills/service";
import type {
  SkillHubCatalogRecord,
  SkillHubFamilyRecord,
  SkillHubSyncReport,
} from "../types";
import type { SkillHubServiceContext } from "./context";
import { createSkillHubManifestHost } from "./host";
import { buildSkillHubServicePaths, ensureSkillHubServicePaths } from "./paths";

export interface SkillHubServiceCache {
  lastSyncReport?: SkillHubSyncReport;
  catalog?: SkillHubCatalogRecord[];
  families?: SkillHubFamilyRecord[];
}

export interface SkillHubServiceState {
  cache: SkillHubServiceCache;
  context: SkillHubServiceContext;
}

export function createSkillHubServiceState(input: {
  skills: SkillsService;
  skillSynthesis: SkillSynthesisService;
  agentSdk: AgentSdkService;
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
      agentSdk: input.agentSdk,
      paths,
      manifestHost: createSkillHubManifestHost(paths),
    },
  };
}

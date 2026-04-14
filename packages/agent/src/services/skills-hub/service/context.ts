import type { AgentSdkService } from "../../agent-sdk-service";
import type { SkillSynthesisService } from "../../skill-synthesis/service";
import type { SkillsService } from "../../skills/service";
import type { SkillsHubManifestHost } from "../manifests";
import type { SkillHubServicePaths } from "./paths";

export interface SkillHubServiceContext {
  skills: SkillsService;
  skillSynthesis: SkillSynthesisService;
  agentSdk: AgentSdkService;
  paths: SkillHubServicePaths;
  manifestHost: SkillsHubManifestHost;
}

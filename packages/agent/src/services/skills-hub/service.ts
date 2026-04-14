import type { AgentSdkService } from "../agent-sdk-service";
import type { SkillSynthesisService } from "../skill-synthesis/service";
import type { SkillsService } from "../skills/service";
import { createSkillsHubServiceApi } from "./service/api";
import type { SkillsHubServiceApi } from "./service/api-types";
import {
  createSkillHubServiceState,
  type SkillHubServiceState,
} from "./service/state";

export type { SkillHubDistributionRecord } from "./types";

export class SkillsHubService {
  private readonly state: SkillHubServiceState;
  readonly workspace!: SkillsHubServiceApi["workspace"];
  readonly generated!: SkillsHubServiceApi["generated"];
  readonly families!: SkillsHubServiceApi["families"];
  readonly family!: SkillsHubServiceApi["family"];
  readonly catalog!: SkillsHubServiceApi["catalog"];
  readonly searchCatalog!: SkillsHubServiceApi["searchCatalog"];
  readonly sync!: SkillsHubServiceApi["sync"];
  readonly syncCatalog!: SkillsHubServiceApi["syncCatalog"];
  readonly manifest!: SkillsHubServiceApi["manifest"];
  readonly catalogEntry!: SkillsHubServiceApi["catalogEntry"];
  readonly exportManifest!: SkillsHubServiceApi["exportManifest"];
  readonly exportBundle!: SkillsHubServiceApi["exportBundle"];
  readonly importManifest!: SkillsHubServiceApi["importManifest"];
  readonly installFromCatalog!: SkillsHubServiceApi["installFromCatalog"];
  readonly installedManifests!: SkillsHubServiceApi["installedManifests"];
  readonly installedManifest!: SkillsHubServiceApi["installedManifest"];
  readonly summary!: SkillsHubServiceApi["summary"];

  constructor(
    skills: SkillsService,
    skillSynthesis: SkillSynthesisService,
    agentSdk: AgentSdkService,
    baseDir: string,
  ) {
    this.state = createSkillHubServiceState({
      skills,
      skillSynthesis,
      agentSdk,
      baseDir,
    });
    Object.assign(this, createSkillsHubServiceApi(this.state));
  }
}

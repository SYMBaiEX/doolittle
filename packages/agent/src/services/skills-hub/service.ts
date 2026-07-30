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
  readonly project!: SkillsHubServiceApi["project"];
  readonly manifest!: SkillsHubServiceApi["manifest"];
  readonly exportManifest!: SkillsHubServiceApi["exportManifest"];
  readonly exportBundle!: SkillsHubServiceApi["exportBundle"];
  readonly importManifest!: SkillsHubServiceApi["importManifest"];
  readonly installedManifests!: SkillsHubServiceApi["installedManifests"];
  readonly installedManifest!: SkillsHubServiceApi["installedManifest"];
  readonly summary!: SkillsHubServiceApi["summary"];

  constructor(
    skills: SkillsService,
    skillSynthesis: SkillSynthesisService,
    baseDir: string,
  ) {
    this.state = createSkillHubServiceState({
      skills,
      skillSynthesis,
      baseDir,
    });
    Object.assign(this, createSkillsHubServiceApi(this.state));
  }
}

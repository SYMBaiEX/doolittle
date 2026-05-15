import { homedir } from "node:os";
import { join } from "node:path";
import {
  getCuratedActiveDir,
  getSkillsDir,
  type SkillCommandSpec,
} from "@elizaos/skills";
import type { SkillDocument } from "@/types";
import type { AgentSdkService } from "../agent-sdk-service";
import { loadNativeSkills } from "./native-loader";
import { buildSkillsSummary } from "./summary";
import type { SkillsSnapshot, SkillsWorkspaceSummary } from "./types";

const CACHE_TTL_MS = 2_000;

export class SkillsService {
  private readonly bundledSkillsDir = getSkillsDir();
  private readonly managedSkillsDir = join(homedir(), ".elizaos", "skills");
  private readonly curatedSkillsDir = getCuratedActiveDir();
  private readonly projectSkillsDir: string;
  private snapshot?: SkillsSnapshot;

  constructor(
    private readonly skillsDir: string,
    private readonly agentSdk: AgentSdkService,
    private readonly workspaceDir: string = process.cwd(),
  ) {
    this.projectSkillsDir = join(this.workspaceDir, ".elizaos", "skills");
  }

  rootDir(): string {
    return this.skillsDir;
  }

  workspace(): SkillDocument[] {
    return this.ensureSnapshot().workspace;
  }

  native(): SkillDocument[] {
    return this.ensureSnapshot().native;
  }

  bundled(): SkillDocument[] {
    return this.native().filter((skill) => skill.source === "bundled");
  }

  list(): SkillDocument[] {
    return this.ensureSnapshot().all;
  }

  get(slug: string): SkillDocument | undefined {
    return this.list().find((skill) => skill.slug === slug);
  }

  summary(): SkillsWorkspaceSummary {
    return this.ensureSnapshot().summary;
  }

  commandSpecs(): SkillCommandSpec[] {
    return this.ensureSnapshot().commandSpecs;
  }

  async catalog(limit = 20) {
    return this.agentSdk.skillCatalog(false, limit);
  }

  async searchCatalog(query: string, limit = 15) {
    return this.agentSdk.searchSkillCatalog(query, limit);
  }

  private ensureSnapshot(force = false): SkillsSnapshot {
    const now = Date.now();
    if (
      !force &&
      this.snapshot &&
      now - this.snapshot.capturedAt < CACHE_TTL_MS
    ) {
      return this.snapshot;
    }

    const { workspace, native, commandSpecs } = this.loadNativeSkills();
    const allBySlug = new Map<string, SkillDocument>();

    for (const skill of native) {
      allBySlug.set(skill.slug, skill);
    }
    for (const skill of workspace) {
      allBySlug.set(skill.slug, skill);
    }

    const all = [...allBySlug.values()].sort((left, right) =>
      left.slug.localeCompare(right.slug),
    );
    const summary = this.buildSummary(all, commandSpecs);

    this.snapshot = {
      capturedAt: now,
      workspace,
      native,
      all,
      summary,
      commandSpecs,
    };

    return this.snapshot;
  }

  private loadNativeSkills(): {
    workspace: SkillDocument[];
    native: SkillDocument[];
    commandSpecs: SkillCommandSpec[];
  } {
    return loadNativeSkills({
      skillsDir: this.skillsDir,
      workspaceDir: this.workspaceDir,
      roots: {
        bundledSkillsDir: this.bundledSkillsDir,
        managedSkillsDir: this.managedSkillsDir,
        curatedSkillsDir: this.curatedSkillsDir,
        projectSkillsDir: this.projectSkillsDir,
        workspaceSkillsDir: this.skillsDir,
      },
    });
  }

  private buildSummary(
    skills: SkillDocument[],
    commandSpecs: SkillCommandSpec[],
  ): SkillsWorkspaceSummary {
    return buildSkillsSummary(skills, commandSpecs);
  }
}

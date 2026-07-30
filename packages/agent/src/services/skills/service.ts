import { homedir } from "node:os";
import { join } from "node:path";
import type { IAgentRuntime } from "@elizaos/core";
import { AgentSkillsService } from "@elizaos/plugin-agent-skills";
import {
  getCuratedActiveDir,
  getSkillsDir,
  type SkillCommandSpec,
} from "@elizaos/skills/index";
import type { SkillDocument } from "@/types";
import type { AgentSdkService } from "../agent-sdk-service";
import {
  resolveWorkspaceDirectory,
  type WorkspaceDirectorySource,
} from "../workspace-directory";
import { loadNativeSkills } from "./native-loader";
import { projectOfficialSkills } from "./official-loader";
import { buildSkillsSummary } from "./summary";
import type { SkillsSnapshot, SkillsWorkspaceSummary } from "./types";

const CACHE_TTL_MS = 2_000;

export class SkillsService {
  private readonly bundledSkillsDir = getSkillsDir();
  private readonly managedSkillsDir = join(homedir(), ".elizaos", "skills");
  private readonly curatedSkillsDir = getCuratedActiveDir();
  private snapshot?: SkillsSnapshot;
  private runtime?: IAgentRuntime;

  constructor(
    private readonly skillsDir: string,
    private readonly agentSdk: AgentSdkService,
    private readonly workspaceDirectory: WorkspaceDirectorySource = process.cwd(),
  ) {}

  rootDir(): string {
    return this.skillsDir;
  }

  bindRuntime(runtime: IAgentRuntime): void {
    this.runtime = runtime;
    this.invalidateWorkspace();
  }

  invalidateWorkspace(): void {
    this.snapshot = undefined;
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

    const { workspace, native, commandSpecs } = this.loadSkills();
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
    const workspaceDir = resolveWorkspaceDirectory(this.workspaceDirectory);
    return loadNativeSkills({
      skillsDir: this.skillsDir,
      workspaceDir,
      roots: {
        bundledSkillsDir: this.bundledSkillsDir,
        managedSkillsDir: this.managedSkillsDir,
        curatedSkillsDir: this.curatedSkillsDir,
        projectSkillsDir: join(workspaceDir, ".elizaos", "skills"),
        workspaceSkillsDir: this.skillsDir,
      },
    });
  }

  private loadSkills(): {
    workspace: SkillDocument[];
    native: SkillDocument[];
    commandSpecs: SkillCommandSpec[];
  } {
    const local = this.loadNativeSkills();
    const official = this.runtime?.getService(AgentSkillsService.serviceType) as
      | AgentSkillsService
      | null
      | undefined;
    return official
      ? projectOfficialSkills(official.getLoadedSkills(), local)
      : local;
  }

  private buildSummary(
    skills: SkillDocument[],
    commandSpecs: SkillCommandSpec[],
  ): SkillsWorkspaceSummary {
    return buildSkillsSummary(skills, commandSpecs);
  }
}

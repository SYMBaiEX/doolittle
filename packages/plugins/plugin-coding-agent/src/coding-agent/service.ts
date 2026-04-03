import type { Service } from "@elizaos/core";
import { Service as ElizaService, type IAgentRuntime } from "@elizaos/core";
import { buildCodingAgentContext } from "./runtime";
import type {
  CodingAgentContextOptions,
  CodingAgentPluginOptions,
} from "./types";

export function createCodingAgentServiceClass(
  options: CodingAgentPluginOptions,
) {
  class CodingAgentService extends ElizaService {
    static serviceType = "coding_agent";
    capabilityDescription =
      "Coding agent service for workspace, repository, and task orchestration.";

    private readonly workspace = options.workspace;
    private readonly repository = options.repository;
    private readonly shell = options.shell;
    private readonly delegation = options.delegation;

    // biome-ignore lint/complexity/noUselessConstructor: ElizaOS ServiceClass expects an optional runtime constructor.
    constructor(runtime?: IAgentRuntime) {
      super(runtime);
    }

    static async start(runtime?: IAgentRuntime): Promise<Service> {
      return new CodingAgentService(runtime);
    }

    async stop(): Promise<void> {}

    read(path: string) {
      return this.workspace.read(path);
    }

    write(path: string, content: string) {
      return this.workspace.write(path, content);
    }

    search(query: string, limit = 20) {
      return this.workspace.search(query, limit);
    }

    repoStatus() {
      return this.repository.status();
    }

    repoDiff() {
      return this.repository.diffStat();
    }

    repoLog(limit = 10) {
      return this.repository.recentCommits(limit);
    }

    run(command: string) {
      return this.shell.run(command);
    }

    inspectProject(targetPath?: string) {
      return options.inspectProject(targetPath ?? options.workspaceRoot);
    }

    delegate(
      title: string,
      objective: string,
      metadata?: Record<string, string>,
    ) {
      return this.delegation.create({ title, objective, metadata });
    }

    tasks() {
      return this.delegation.list();
    }

    context(
      taskDescription: string,
      contextOptions: CodingAgentContextOptions = {},
    ) {
      return buildCodingAgentContext({
        taskDescription,
        workspaceRoot: options.workspaceRoot,
        repositoryAvailable: this.repository.isRepository?.() ?? false,
        contextOptions,
      });
    }
  }

  return CodingAgentService;
}

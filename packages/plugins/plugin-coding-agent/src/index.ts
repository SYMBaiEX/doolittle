import type { IAgentRuntime, Plugin, Service } from "@elizaos/core";
import { Service as ElizaService } from "@elizaos/core";
import type { DelegationService } from "@/services/delegation-service";
import type { RepositoryService } from "@/services/repository-service";
import type { TerminalService } from "@/services/terminal-service";
import type { WorkspaceService } from "@/services/workspace-service";

export interface CodingAgentPluginOptions {
  workspace: Pick<WorkspaceService, "read" | "write" | "search">;
  repository: {
    status(): ReturnType<RepositoryService["status"]>;
    diff(): ReturnType<RepositoryService["diffStat"]>;
    log(limit?: number): ReturnType<RepositoryService["recentCommits"]>;
  };
  shell: Pick<TerminalService, "run">;
  delegation: Pick<DelegationService, "list"> & {
    create(
      input: Pick<
        Parameters<DelegationService["create"]>[0],
        "title" | "objective" | "metadata"
      >,
    ): ReturnType<DelegationService["create"]>;
  };
}

export function createCodingAgentPlugin(
  options: CodingAgentPluginOptions,
): Plugin {
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
      return this.repository.diff();
    }

    repoLog(limit = 10) {
      return this.repository.log(limit);
    }

    run(command: string) {
      return this.shell.run(command);
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
  }

  return {
    name: "coding-agent",
    description:
      "Coding agent plugin layered onto Eliza Agent developer workflows.",
    services: [CodingAgentService],
  };
}

export default createCodingAgentPlugin;

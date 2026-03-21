import type { IAgentRuntime, Plugin, Service } from "@elizaos/core";
import { Service as ElizaService } from "@elizaos/core";

export interface CodingAgentPluginOptions {
  workspace: {
    read(path: string): string;
    write(path: string, content: string): unknown;
    search(query: string, limit?: number): unknown;
  };
  repository: {
    status(): Promise<string>;
    diff(): Promise<string>;
    log(limit?: number): Promise<string>;
  };
  shell: {
    run(command: string): Promise<unknown>;
  };
  delegation: {
    create(input: {
      title: string;
      objective: string;
      metadata?: Record<string, unknown>;
    }): unknown;
    list(): unknown[];
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
      metadata?: Record<string, unknown>,
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

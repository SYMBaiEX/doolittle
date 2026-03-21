import type { Plugin } from "@elizaos/core";
import {
  createServiceAdapter,
  createServicePlugin,
} from "@elizaos/plugin-compat";

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
  const CodingAgentService = createServiceAdapter({
    serviceType: "coding_agent",
    capabilityDescription:
      "Official-style coding agent service for workspace, repository, and task orchestration.",
    create: async () => ({
      read(path: string) {
        return options.workspace.read(path);
      },
      write(path: string, content: string) {
        return options.workspace.write(path, content);
      },
      search(query: string, limit = 20) {
        return options.workspace.search(query, limit);
      },
      repoStatus() {
        return options.repository.status();
      },
      repoDiff() {
        return options.repository.diff();
      },
      repoLog(limit = 10) {
        return options.repository.log(limit);
      },
      run(command: string) {
        return options.shell.run(command);
      },
      delegate(
        title: string,
        objective: string,
        metadata?: Record<string, unknown>,
      ) {
        return options.delegation.create({ title, objective, metadata });
      },
      tasks() {
        return options.delegation.list();
      },
    }),
  });

  return createServicePlugin(
    "coding-agent",
    "Official-style coding agent plugin layered onto Eliza Agent developer workflows.",
    CodingAgentService,
  );
}

export default createCodingAgentPlugin;

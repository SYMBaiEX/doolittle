import { DOOLITTLE_CODING_AGENT_SERVICE } from "@doolittle/contracts";
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
    static serviceType = DOOLITTLE_CODING_AGENT_SERVICE;
    capabilityDescription =
      "Coding workspace service for project files, repository inspection, and shell execution.";

    private readonly workspace = options.workspace;
    private readonly repository = options.repository;
    private readonly shell = options.shell;

    // biome-ignore lint/complexity/noUselessConstructor: ElizaOS ServiceClass expects an optional runtime constructor.
    constructor(runtime?: IAgentRuntime) {
      super(runtime);
    }

    static async start(runtime?: IAgentRuntime): Promise<Service> {
      return new CodingAgentService(runtime);
    }

    async stop(): Promise<void> {}

    workspaceRoot() {
      return this.workspace.root();
    }

    async workspaceSummary(limit = 40) {
      return this.workspace.summaryAsync
        ? await this.workspace.summaryAsync(limit)
        : this.workspace.summary(limit);
    }

    read(path: string) {
      return this.workspace.read(path);
    }

    write(path: string, content: string) {
      return this.workspace.write(path, content);
    }

    readLines(path: string, options: { offset?: number; limit?: number } = {}) {
      return this.workspace.readLines(path, options);
    }

    writeFile(path: string, content: string) {
      return this.workspace.writeFile(path, content);
    }

    createDirectory(path: string) {
      return this.workspace.createDirectory(path);
    }

    patch(
      path: string,
      oldText: string,
      newText: string,
      options: { replaceAll?: boolean } = {},
    ) {
      return this.workspace.patch(path, oldText, newText, options);
    }

    searchFiles(input: Parameters<typeof this.workspace.searchFiles>[0]) {
      return this.workspace.searchFiles(input);
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
      return options.inspectProject(targetPath ?? this.workspace.root());
    }

    findCodebases(query: string) {
      return options.findCodebases(query, this.workspace.root());
    }

    resolveProjectTarget(inputPath: string) {
      return options.resolveProjectTarget(inputPath, this.workspace.root());
    }

    context(
      taskDescription: string,
      contextOptions: CodingAgentContextOptions = {},
    ) {
      const workspaceRoot = this.workspace.root();
      return buildCodingAgentContext({
        taskDescription,
        workspaceRoot,
        repositoryAvailable: this.repository.isRepository?.() ?? false,
        contextOptions,
      });
    }
  }

  return CodingAgentService;
}

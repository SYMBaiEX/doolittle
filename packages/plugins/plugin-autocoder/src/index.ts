import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  Service as ElizaService,
  type IAgentRuntime,
  type Plugin,
} from "@elizaos/core";

interface AutocoderPluginOptions {
  terminal: {
    run(command: string, timeoutMs?: number): Promise<unknown>;
  };
  repository: {
    isRepository(): boolean;
    status(): Promise<string>;
    diffStat(): Promise<string>;
    recentCommits(limit?: number): Promise<string>;
  };
  workspace: {
    rootDir(): string;
  };
}

interface SecretStore {
  secrets: Record<string, string>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function safeSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 48);
}

function stringify(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

export function createAutocoderPlugin(options: AutocoderPluginOptions): Plugin {
  class CodeGenerationService extends ElizaService {
    static serviceType = "code-generation";
    capabilityDescription =
      "Workspace-native code generation service for research, PRDs, QA, and generation planning.";

    static async start(
      runtime?: IAgentRuntime,
    ): Promise<CodeGenerationService> {
      return new CodeGenerationService(runtime);
    }

    async stop(): Promise<void> {}

    async performResearch(request: Record<string, unknown>) {
      const repositoryStatus = options.repository.isRepository()
        ? await options.repository.status().catch(() => "(unavailable)")
        : "(workspace is not inside a git repository)";
      const diff = options.repository.isRepository()
        ? await options.repository.diffStat().catch(() => "(unavailable)")
        : "(workspace is not inside a git repository)";
      const commits = options.repository.isRepository()
        ? await options.repository.recentCommits(5).catch(() => "(unavailable)")
        : "(workspace is not inside a git repository)";

      return {
        generatedAt: nowIso(),
        kind: "research",
        request,
        workspaceRoot: options.workspace.rootDir(),
        repositoryStatus,
        diff,
        commits,
        findings: [
          "Use the existing native transport, ownership, and ecosystem control planes as the default integration points.",
          "Prefer workspace-native plugin services over mixed upstream lifecycle assumptions.",
          "Capture workflow artifacts in the persisted autocoder pipeline so every generation step remains inspectable.",
        ],
        plan: [
          "Map request inputs to native services and required packages.",
          "Generate the minimal plugin or workspace shape needed.",
          "Validate with lint, typecheck, tests, and build before finalizing.",
        ],
      };
    }

    async generatePRD(
      request: Record<string, unknown>,
      research?: Record<string, unknown>,
    ) {
      const projectName =
        typeof request.projectName === "string"
          ? request.projectName
          : "Eliza Native Build";
      const objective =
        typeof request.description === "string"
          ? request.description
          : "Deliver the requested capability through native ElizaOS services.";

      return [
        `# ${projectName} PRD`,
        "",
        "## Objective",
        objective,
        "",
        "## Scope",
        "- Extend the native Eliza runtime through workspace-owned plugins and services.",
        "- Preserve operator visibility and persisted workflow artifacts.",
        "- Validate every pass with lint, typecheck, tests, and build.",
        "",
        "## Inputs",
        "```json",
        stringify(request),
        "```",
        "",
        "## Research Summary",
        "```json",
        stringify(research ?? {}),
        "```",
        "",
        "## Acceptance Criteria",
        "- Native runtime surface is available through CLI and API.",
        "- Operator and diagnostics views reflect the new ownership.",
        "- Build and tests remain green.",
      ].join("\n");
    }

    async performQA(projectPath: string) {
      const commands = [
        "bun run lint:check",
        "bun run typecheck",
        "bun test",
        "bun run build",
      ];
      return {
        generatedAt: nowIso(),
        projectPath,
        commands,
        summary:
          "Workspace-native QA checklist generated for the requested project path.",
      };
    }

    async generateCode(request: Record<string, unknown>) {
      const projectName =
        typeof request.projectName === "string"
          ? request.projectName
          : "eliza-native-project";
      const slug = safeSlug(projectName) || "eliza-native-project";
      return {
        generatedAt: nowIso(),
        projectName,
        slug,
        workspaceRoot: options.workspace.rootDir(),
        files: [
          `${slug}/README.md`,
          `${slug}/package.json`,
          `${slug}/src/index.ts`,
        ],
        summary:
          "Workspace-native code generation scaffold prepared through the autocoder plugin.",
        request,
      };
    }

    async generateCodeInternal(request: Record<string, unknown>) {
      return this.generateCode(request);
    }

    async runValidationSuite(projectPath: string) {
      return this.performQA(projectPath);
    }

    async generateCodeInChunks(request: Record<string, unknown>) {
      return {
        ...(await this.generateCode(request)),
        chunks: ["scaffold", "runtime wiring", "validation"],
      };
    }

    async installDependencies(projectPath: string) {
      return {
        projectPath,
        command: "bun install",
        summary:
          "Dependency installation should be executed from the generated project root.",
      };
    }
  }

  class GitHubService extends ElizaService {
    static serviceType = "github";
    capabilityDescription =
      "Workspace-native GitHub lifecycle service for autocoder workflows.";

    static async start(runtime?: IAgentRuntime): Promise<GitHubService> {
      return new GitHubService(runtime);
    }

    async stop(): Promise<void> {}

    async createRepository(name: string, isPrivate = true) {
      const command = `gh repo create ${name} ${isPrivate ? "--private" : "--public"} --source . --push --confirm`;
      return {
        createdAt: nowIso(),
        name,
        private: isPrivate,
        command,
        status: "planned",
        detail:
          "Repository creation is routed through the local GitHub CLI path and can be executed when credentials are available.",
      };
    }

    async deleteRepository(name: string) {
      const command = `gh repo delete ${name} --yes`;
      return {
        deletedAt: nowIso(),
        name,
        command,
        status: "planned",
        detail:
          "Repository deletion is routed through the local GitHub CLI path and can be executed when credentials are available.",
      };
    }
  }

  class SecretsManagerService extends ElizaService {
    static serviceType = "secrets-manager";
    capabilityDescription =
      "Workspace-native secrets manager for autocoder and deployment workflows.";

    private readonly rootDir = join(process.cwd(), ".eliza-agent", "secrets");
    private readonly storePath = join(this.rootDir, "secrets.json");

    constructor(runtime?: IAgentRuntime) {
      super(runtime);
      mkdirSync(this.rootDir, { recursive: true });
      if (!existsSync(this.storePath)) {
        this.writeStore({ secrets: {} });
      }
    }

    static async start(
      runtime?: IAgentRuntime,
    ): Promise<SecretsManagerService> {
      return new SecretsManagerService(runtime);
    }

    async stop(): Promise<void> {}

    getSecret(key: string): string | undefined {
      return this.readStore().secrets[key];
    }

    setSecret(key: string, value: string) {
      const store = this.readStore();
      store.secrets[key] = value;
      this.writeStore(store);
      return {
        key,
        storedAt: nowIso(),
      };
    }

    hasSecret(key: string): boolean {
      return key in this.readStore().secrets;
    }

    listSecretKeys(): string[] {
      return Object.keys(this.readStore().secrets).sort();
    }

    private readStore(): SecretStore {
      try {
        const parsed = JSON.parse(readFileSync(this.storePath, "utf8")) as {
          secrets?: Record<string, string>;
        };
        return {
          secrets:
            parsed.secrets && typeof parsed.secrets === "object"
              ? parsed.secrets
              : {},
        };
      } catch {
        return { secrets: {} };
      }
    }

    private writeStore(store: SecretStore): void {
      writeFileSync(this.storePath, JSON.stringify(store, null, 2), "utf8");
    }
  }

  return {
    name: "@elizaos/plugin-autocoder",
    description:
      "Workspace-native autocoder plugin with research, generation, GitHub, and secrets services.",
    services: [CodeGenerationService, GitHubService, SecretsManagerService],
    actions: [],
    providers: [],
    evaluators: [],
  };
}

export const autocoderPlugin = createAutocoderPlugin({
  terminal: {
    run: async () => ({
      success: false,
      detail: "Runtime-less autocoder terminal path is unavailable.",
    }),
  },
  repository: {
    isRepository: () => false,
    status: async () => "(runtime-less repository status unavailable)",
    diffStat: async () => "(runtime-less repository diff unavailable)",
    recentCommits: async () => "(runtime-less repository log unavailable)",
  },
  workspace: {
    rootDir: () => process.cwd(),
  },
});

export default autocoderPlugin;

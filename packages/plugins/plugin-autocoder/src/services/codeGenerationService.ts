import type { IAgentRuntime } from "@elizaos/core";
import { Service as ElizaService } from "@elizaos/core";
import {
  nowIso,
  planningEnvelope,
  safeSlug,
  stringify,
} from "../shared/planning";
import type { AutocoderPluginOptions } from "../shared/types";

export function createCodeGenerationService(options: AutocoderPluginOptions) {
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

      return planningEnvelope({
        generatedAt: nowIso(),
        kind: "research",
        mode: "analysis",
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
        summary:
          "Planning-only research output generated. No files or repositories were changed.",
      });
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

      return planningEnvelope({
        generatedAt: nowIso(),
        kind: "prd",
        workspaceRoot: options.workspace.rootDir(),
        projectName,
        request,
        research: research ?? {},
        content: [
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
        ].join("\n"),
        summary:
          "Planning-only PRD generated. This is documentation output, not an executed implementation.",
      });
    }

    async performQA(projectPath: string) {
      const commands = [
        "bun run lint:check",
        "bun run typecheck",
        "bun test",
        "bun run build",
      ];
      return planningEnvelope({
        generatedAt: nowIso(),
        projectPath,
        commands,
        summary:
          "Planning-only QA checklist generated for the requested project path. No commands were executed.",
      });
    }

    async generateCode(request: Record<string, unknown>) {
      const projectName =
        typeof request.projectName === "string"
          ? request.projectName
          : "eliza-native-project";
      const slug = safeSlug(projectName) || "eliza-native-project";
      return planningEnvelope({
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
          "Planning-only code generation scaffold prepared through the autocoder plugin. No files were written.",
        request,
      });
    }

    async generateCodeInternal(request: Record<string, unknown>) {
      return this.generateCode(request);
    }

    async runValidationSuite(projectPath: string) {
      return this.performQA(projectPath);
    }

    async generateCodeInChunks(request: Record<string, unknown>) {
      return planningEnvelope({
        ...(await this.generateCode(request)),
        chunks: ["scaffold", "runtime wiring", "validation"],
      });
    }

    async installDependencies(projectPath: string) {
      return planningEnvelope({
        projectPath,
        command: "bun install",
        summary:
          "Dependency installation is available as a suggested next step, but it was not executed by the autocoder plugin.",
      });
    }
  }

  return CodeGenerationService;
}

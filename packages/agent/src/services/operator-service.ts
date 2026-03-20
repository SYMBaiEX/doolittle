import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

import { getNativePackageAudit } from "@/runtime/native/package-audit";
import { getNativePluginCatalog } from "@/runtime/native/plugin-catalog";
import type { EnvConfig } from "@/types";
import type { DiagnosticsService } from "./diagnostics-service";
import type { RepositoryService } from "./repository-service";

interface PackageMetadata {
  name: string;
  version: string;
  description?: string;
  dependencies?: Record<string, string>;
}

export interface OperatorVersionSummary {
  name: string;
  version: string;
  description?: string;
  bun: string;
  dependencies: Record<string, string>;
  nativePlugins: {
    total: number;
    enabled: number;
    official: number;
    vendored: number;
  };
  nativePackages: {
    runtimeLatest: string;
    runtimeAlpha: string;
    aligned: number;
    vendored: number;
    alphaOnly: number;
    workspaceOnly: number;
  };
}

export interface SetupSummary {
  version: OperatorVersionSummary;
  directories: Array<{ label: string; path: string; exists: boolean }>;
  providers: Array<{ id: string; ready: boolean; detail: string }>;
  transports: Array<{ id: string; ready: boolean; detail: string }>;
  nativeServices: Array<{ group: string; services: string[] }>;
  checklist: string[];
}

export interface UpdatePreview {
  version: OperatorVersionSummary;
  repositoryAvailable: boolean;
  status: string;
  recentCommits: string;
  recommendedSteps: string[];
}

export interface MigrationSourceSummary {
  id: string;
  label: string;
  path: string;
  exists: boolean;
}

export interface MigrationInspection {
  rootPath: string;
  exists: boolean;
  files: Array<{
    path: string;
    kind: "context" | "memory" | "persona" | "skill" | "other";
  }>;
  skillCount: number;
  contextCount: number;
}

export interface MigrationResult {
  sourcePath: string;
  destinationPath: string;
  importedFiles: string[];
  importedSkills: string[];
  skippedFiles: string[];
  reportPath: string;
}

export interface MigrationHistoryEntry {
  createdAt: string;
  sourcePath: string;
  destinationPath: string;
  importedFiles: string[];
  importedSkills: string[];
  skippedFiles: string[];
  reportPath: string;
}

export class OperatorService {
  private readonly packageMetadata: PackageMetadata;
  private readonly migrationsDir: string;

  constructor(
    private readonly config: EnvConfig,
    private readonly diagnostics: DiagnosticsService,
    private readonly repository: RepositoryService,
  ) {
    this.packageMetadata = this.loadPackageMetadata();
    this.migrationsDir = join(this.config.dataDir, "migrations");
    mkdirSync(this.migrationsDir, { recursive: true });
  }

  async setupSummary(): Promise<SetupSummary> {
    return {
      version: this.version(),
      directories: [
        {
          label: "workspace",
          path: this.config.workspaceDir,
          exists: existsSync(this.config.workspaceDir),
        },
        {
          label: "data",
          path: this.config.dataDir,
          exists: existsSync(this.config.dataDir),
        },
        {
          label: "skills",
          path: this.config.skillsDir,
          exists: existsSync(this.config.skillsDir),
        },
        {
          label: "gateway",
          path: this.config.gatewayDataDir,
          exists: existsSync(this.config.gatewayDataDir),
        },
      ],
      providers: [
        {
          id: "openai",
          ready: Boolean(this.config.openAiApiKey),
          detail: this.config.openAiApiKey
            ? `Configured for ${this.config.openAiModel}.`
            : "Missing OPENAI_API_KEY.",
        },
        {
          id: "anthropic",
          ready: Boolean(this.config.anthropicApiKey),
          detail: this.config.anthropicApiKey
            ? `Configured for ${this.config.anthropicLargeModel}.`
            : "Missing ANTHROPIC_API_KEY.",
        },
      ],
      transports: [
        {
          id: "telegram",
          ready: Boolean(this.config.telegramBotToken),
          detail: this.config.telegramBotToken
            ? "Telegram token configured."
            : "Missing TELEGRAM_BOT_TOKEN.",
        },
        {
          id: "discord",
          ready: Boolean(this.config.discordBotToken),
          detail: this.config.discordBotToken
            ? "Discord token configured."
            : "Missing DISCORD_BOT_TOKEN.",
        },
        {
          id: "slack",
          ready: Boolean(this.config.slackWebhookUrl),
          detail: this.config.slackWebhookUrl
            ? "Slack webhook configured."
            : "Missing SLACK_WEBHOOK_URL.",
        },
        {
          id: "whatsapp",
          ready: Boolean(
            this.config.whatsappAccessToken &&
              this.config.whatsappPhoneNumberId,
          ),
          detail:
            this.config.whatsappAccessToken && this.config.whatsappPhoneNumberId
              ? "WhatsApp delivery credentials configured."
              : "Missing WhatsApp delivery credentials.",
        },
        {
          id: "signal",
          ready: Boolean(this.config.signalCliCommand),
          detail: this.config.signalCliCommand
            ? "Signal CLI command configured."
            : "Missing SIGNAL_CLI_COMMAND.",
        },
      ],
      nativeServices: [
        {
          group: "officialBacked",
          services: [
            "documents",
            "mcp",
            "acp",
            "web",
            "media",
            "userProfiles",
            "personalities",
            "skills",
            "skillSynthesis",
            "trajectories",
          ],
        },
        {
          group: "customEliza",
          services: [
            "memory",
            "sessions",
            "cron",
            "workspace",
            "terminal",
            "repository",
            "gatewaySessions",
            "delivery",
            "pairing",
            "hooks",
            "contextFiles",
            "settings",
            "tools",
            "diagnostics",
          ],
        },
        {
          group: "productOrchestration",
          services: ["operator", "gatewayConfig", "delegation"],
        },
      ],
      checklist: await this.diagnostics.setupChecklist(),
    };
  }

  async updatePreview(): Promise<UpdatePreview> {
    const repositoryAvailable = this.repository.isRepository();
    const status = repositoryAvailable
      ? await this.repository.status()
      : "(workspace is not inside a git repository)";
    const recentCommits = repositoryAvailable
      ? await this.repository.recentCommits(8)
      : "(no git history available)";

    return {
      version: this.version(),
      repositoryAvailable,
      status,
      recentCommits,
      recommendedSteps: repositoryAvailable
        ? [
            "Review git status before updating runtime dependencies.",
            "Run bun install after dependency changes.",
            "Re-run bun run typecheck, bun test, and bun run build after updating.",
          ]
        : [
            "Initialize a git repository if you want update previews tied to commit history.",
            "Keep bun install, bun run typecheck, bun test, and bun run build as the standard update validation flow.",
          ],
    };
  }

  migrationSources(): MigrationSourceSummary[] {
    const openClawPath = join(homedir(), ".openclaw");
    return [
      {
        id: "openclaw",
        label: "OpenClaw home",
        path: openClawPath,
        exists: existsSync(openClawPath),
      },
      {
        id: "workspace",
        label: "Current workspace",
        path: this.config.workspaceDir,
        exists: existsSync(this.config.workspaceDir),
      },
    ];
  }

  inspectMigrationSource(sourcePath: string): MigrationInspection {
    const rootPath = resolve(sourcePath);
    if (!existsSync(rootPath)) {
      return {
        rootPath,
        exists: false,
        files: [],
        skillCount: 0,
        contextCount: 0,
      };
    }

    const files: MigrationInspection["files"] = [];
    const knownFiles = [
      ["AGENTS.md", "context"],
      ["SOUL.md", "persona"],
      ["MEMORY.md", "memory"],
      ["USER.md", "memory"],
    ] as const;

    for (const [name, kind] of knownFiles) {
      const pathname = join(rootPath, name);
      if (existsSync(pathname)) {
        files.push({ path: pathname, kind });
      }
    }

    const skillsPath = join(rootPath, "skills");
    if (existsSync(skillsPath)) {
      for (const entry of this.walkSkills(skillsPath)) {
        files.push({ path: entry, kind: "skill" });
      }
    }

    return {
      rootPath,
      exists: true,
      files,
      skillCount: files.filter((entry) => entry.kind === "skill").length,
      contextCount: files.filter(
        (entry) => entry.kind === "context" || entry.kind === "persona",
      ).length,
    };
  }

  applyMigration(
    sourcePath: string,
    options?: { overwrite?: boolean },
  ): MigrationResult {
    const overwrite = options?.overwrite ?? false;
    const inspection = this.inspectMigrationSource(sourcePath);
    if (!inspection.exists) {
      throw new Error(`Migration source not found: ${inspection.rootPath}`);
    }

    const importedFiles: string[] = [];
    const importedSkills: string[] = [];
    const skippedFiles: string[] = [];

    for (const entry of inspection.files) {
      if (entry.kind === "skill") {
        const skillRoot = this.findSkillRoot(entry.path);
        if (!skillRoot) {
          skippedFiles.push(entry.path);
          continue;
        }
        const slug = basename(skillRoot);
        const destination = join(this.config.skillsDir, "imports", slug);
        if (existsSync(destination) && !overwrite) {
          skippedFiles.push(destination);
          continue;
        }
        mkdirSync(dirname(destination), { recursive: true });
        cpSync(skillRoot, destination, { recursive: true, force: overwrite });
        importedSkills.push(destination);
        continue;
      }

      const destination =
        entry.kind === "memory"
          ? join(this.migrationsDir, basename(entry.path))
          : join(this.config.workspaceDir, basename(entry.path));
      if (existsSync(destination) && !overwrite) {
        skippedFiles.push(destination);
        continue;
      }
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(entry.path, destination);
      importedFiles.push(destination);
    }

    const reportPath = join(this.migrationsDir, `migration-${Date.now()}.json`);
    const report = {
      createdAt: new Date().toISOString(),
      sourcePath: inspection.rootPath,
      destinationPath: this.config.workspaceDir,
      importedFiles,
      importedSkills,
      skippedFiles,
    };
    writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

    return {
      sourcePath: inspection.rootPath,
      destinationPath: this.config.workspaceDir,
      importedFiles,
      importedSkills,
      skippedFiles,
      reportPath,
    };
  }

  migrationHistory(limit = 20): MigrationHistoryEntry[] {
    return readdirSync(this.migrationsDir)
      .filter(
        (entry) => entry.startsWith("migration-") && entry.endsWith(".json"),
      )
      .map((entry) => join(this.migrationsDir, entry))
      .map((pathname) => {
        const parsed = JSON.parse(readFileSync(pathname, "utf8")) as Omit<
          MigrationHistoryEntry,
          "reportPath"
        >;
        return {
          ...parsed,
          reportPath: pathname,
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  version(): OperatorVersionSummary {
    const nativePlugins = getNativePluginCatalog(this.config);
    const nativePackages = getNativePackageAudit(this.config);
    return {
      name: this.packageMetadata.name,
      version: this.packageMetadata.version,
      description: this.packageMetadata.description,
      bun: Bun.version,
      dependencies: {
        "@elizaos/core":
          this.packageMetadata.dependencies?.["@elizaos/core"] ?? "unknown",
        elizaos: this.packageMetadata.dependencies?.elizaos ?? "unknown",
        "@elizaos/plugin-openai":
          this.packageMetadata.dependencies?.["@elizaos/plugin-openai"] ??
          "unknown",
        "@elizaos/plugin-anthropic":
          this.packageMetadata.dependencies?.["@elizaos/plugin-anthropic"] ??
          "unknown",
      },
      nativePlugins: {
        total: nativePlugins.length,
        enabled: nativePlugins.filter((entry) => entry.enabled).length,
        official: nativePlugins.filter((entry) => entry.source === "official")
          .length,
        vendored: nativePlugins.filter((entry) => entry.source === "vendored")
          .length,
      },
      nativePackages: {
        runtimeLatest: nativePackages.runtime.latest,
        runtimeAlpha: nativePackages.runtime.alpha,
        aligned: nativePackages.summary.aligned,
        vendored: nativePackages.summary.vendored,
        alphaOnly: nativePackages.summary.alphaOnly,
        workspaceOnly: nativePackages.summary.workspaceOnly,
      },
    };
  }

  private walkSkills(rootPath: string): string[] {
    const collected: string[] = [];
    for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
      const pathname = join(rootPath, entry.name);
      if (entry.isDirectory()) {
        collected.push(...this.walkSkills(pathname));
      } else if (entry.isFile() && entry.name === "SKILL.md") {
        collected.push(pathname);
      }
    }
    return collected;
  }

  private findSkillRoot(skillFile: string): string | null {
    const root = dirname(skillFile);
    return statSync(root).isDirectory() ? root : null;
  }

  private loadPackageMetadata(): PackageMetadata {
    const packagePath = resolve(
      dirname(new URL(import.meta.url).pathname),
      "../../../../package.json",
    );
    return JSON.parse(readFileSync(packagePath, "utf8")) as PackageMetadata;
  }
}

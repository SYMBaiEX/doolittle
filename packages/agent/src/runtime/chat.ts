import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ChannelType,
  createMessageMemory,
  stringToUuid,
  type UUID,
} from "@elizaos/core";
import {
  buildTransportDrilldown,
  formatTransportDrilldown,
  parseGatewayFiltersFromText,
  parseTransportPlatform,
} from "@/gateway/control-plane";
import { summarizeTransportInventory } from "@/gateway/transport-contract";
import {
  getLinkedProviderAccountsSnapshot,
  getLinkedProviderConnectAdvice,
  getLinkedProviderLoginCommand,
  getLinkedProviderSetupCommand,
  refreshLinkedClaudeCodeCredentials,
  refreshLinkedCodexCredentials,
  resolveLinkedProviderCredentials,
} from "@/runtime/native/account-auth";
import {
  getNativePluginCatalog,
  groupNativePluginCatalog,
} from "@/runtime/native/plugin-catalog";
import {
  analyzeEffectiveBrowserComparison,
  analyzeEffectiveBrowserPage,
  cancelEffectiveForm,
  captureEffectiveBrowserPage,
  compareEffectiveBrowserPages,
  createEffectiveDelegationTask,
  createEffectiveForm,
  createEffectivePlan,
  createEffectiveRepository,
  createEffectiveSandbox,
  deleteEffectiveRepository,
  describeEffectiveCachedMcpTools,
  describeEffectiveMcpTool,
  discoverEffectiveMcpTools,
  executeEffectiveSandboxCode,
  exportEffectiveSkillHubManifest,
  fetchEffectiveBrowserPage,
  generateEffectiveCode,
  generateEffectivePrd,
  getAutonomousControlPlane,
  getEffectiveBrowserStatus,
  getEffectiveCachedMcpTools,
  getEffectiveDelegationChildren,
  getEffectiveDelegationOverview,
  getEffectiveDelegationQueue,
  getEffectiveDelegationTask,
  getEffectiveDelegationTasks,
  getEffectiveDelegationTree,
  getEffectiveExperienceSummary,
  getEffectiveForm,
  getEffectiveFormTemplates,
  getEffectiveGeneratedSkills,
  getEffectiveMcpStatus,
  getEffectiveMemorySnapshot,
  getEffectivePersonalityList,
  getEffectivePersonalitySummary,
  getEffectivePlan,
  getEffectivePluginManagerInventory,
  getEffectiveSecret,
  getEffectiveShellHistory,
  getEffectiveShellStatus,
  getEffectiveSkillHubCatalog,
  getEffectiveSkillHubFamilies,
  getEffectiveSkillHubFamily,
  getEffectiveSkillHubGenerated,
  getEffectiveSkillHubInstalled,
  getEffectiveSkillHubInstalledManifest,
  getEffectiveSkillHubSummary,
  getEffectiveSkillHubWorkspace,
  getEffectiveSkills,
  getEffectiveSkillsSummary,
  getEffectiveUserBeliefs,
  getEffectiveUserEngagement,
  getEffectiveUserProfileSearch,
  getEffectiveUserProfileSummary,
  getEffectiveUserRelationship,
  getNativeEcosystemSnapshot,
  getNativeExecutionControlPlane,
  getNativeFormsControlPlane,
  getNativeIntegrationControlPlane,
  getNativeMediaControlPlane,
  getNativeOwnershipControlPlane,
  getNativeOwnershipSnapshot,
  getNativePlanningControlPlane,
  getNativeResearchControlPlane,
  getNativeServices,
  getNativeTransportControlPlane,
  importEffectiveSkillHubManifest,
  inspectEffectiveBrowserPage,
  installEffectiveSkillHubManifest,
  invokeEffectiveMcp,
  invokeEffectiveMcpTool,
  killEffectiveSandbox,
  listEffectiveForms,
  listEffectivePlans,
  listEffectiveSandboxes,
  listEffectiveSecretKeys,
  performEffectiveCodeQa,
  performEffectiveCodeResearch,
  retryEffectiveDelegationTask,
  runEffectiveShellCommand,
  screenshotEffectiveBrowserPage,
  searchEffectiveCachedMcpTools,
  searchEffectiveSkillHubCatalog,
  setEffectiveSecret,
  snapshotEffectiveBrowserPage,
  syncEffectiveSkillHub,
} from "@/runtime/native/service-bridge";
import {
  DEFAULT_TUI_THEME,
  getTuiTheme,
  listTuiThemes,
  nextTuiTheme,
  previousTuiTheme,
  resolveTuiThemeName,
} from "@/runtime/theme-catalog";
import type { RuntimeSettings } from "@/services/settings-service";
import type {
  ChatTurnRequest,
  CronJobRuntimeOverrides,
  MemoryTarget,
  PlatformName,
  UserProfileWorkspaceSummary,
} from "@/types";
import type { AppContext } from "./bootstrap";

export type AgentExecutionContext = Pick<
  AppContext,
  "config" | "services" | "runtime"
> & {
  gateway?: AppContext["gateway"];
};

function nowIso(): string {
  return new Date().toISOString();
}

export function formatMemorySummary(summary: {
  target: string;
  entries: number;
  characters: number;
  preview: string[];
}): string {
  return [
    `target=${summary.target}`,
    `entries=${summary.entries}`,
    `characters=${summary.characters}`,
    `preview=${summary.preview.length ? summary.preview.join(" | ") : "none"}`,
  ].join(" ");
}

export function formatPersonalitySummary(summary: {
  total: number;
  activeId?: string;
  names: string[];
}): string {
  return [
    `total=${summary.total}`,
    `active=${summary.activeId ?? "n/a"}`,
    `names=${summary.names.length ? summary.names.join(", ") : "none"}`,
  ].join(" ");
}

export function formatRolodexSummary(
  summary: UserProfileWorkspaceSummary,
): string {
  const formatPairs = (items: Record<string, number>) => {
    const pairs = Object.entries(items)
      .filter(([, value]) => value > 0)
      .map(([key, value]) => `${key}:${value}`);
    return pairs.length ? pairs.join(",") : "none";
  };

  const topChannels = summary.topChannels
    .map((entry) => `${entry.channel}:${entry.count}`)
    .join(", ");
  const topSignals = summary.topSignals
    .map((entry) => `${entry.signal}(${entry.count})`)
    .join(", ");

  return [
    `totalProfiles=${summary.totalProfiles}`,
    `agent=${summary.agentName}`,
    `recent=${summary.recentProfiles.length ? summary.recentProfiles.join(",") : "none"}`,
    `beliefs=${summary.totalBeliefs}`,
    `sources=${summary.totalBeliefSources}`,
    `relationships=${summary.activeRelationships}/${summary.trustedRelationships}`,
    `engaged=${summary.engagedProfiles}`,
    `status=${formatPairs(summary.relationshipStatusCounts)}`,
    `topChannels=${topChannels || "none"}`,
    `topSignals=${topSignals || "none"}`,
  ].join(" ");
}

export function formatExperienceSummary(summary: {
  sessions: { totalSessions: number; recentSessionIds: string[] };
  memory: {
    shared: {
      target: string;
      entries: number;
      characters: number;
      preview: string[];
    };
    user: {
      target: string;
      entries: number;
      characters: number;
      preview: string[];
    };
  };
}): string {
  return [
    `sessions=${summary.sessions.totalSessions}`,
    `recent=${summary.sessions.recentSessionIds.length ? summary.sessions.recentSessionIds.join(",") : "none"}`,
    `memory.shared=${summary.memory.shared.entries}/${summary.memory.shared.characters}`,
    `memory.user=${summary.memory.user.entries}/${summary.memory.user.characters}`,
  ].join(" ");
}

function currentCliSessionId(context: AgentExecutionContext): string {
  return (
    context.services.sessions.listSessions(1)[0]?.sessionId ?? "cli:local-user"
  );
}

function createAutocoderWorkflow(
  context: AgentExecutionContext,
  input: {
    title: string;
    objective: string;
    kind: Parameters<
      AgentExecutionContext["services"]["autocoderPipeline"]["startWorkflow"]
    >[0]["kind"];
    projectName?: string;
    repositoryName?: string;
  },
) {
  const sessionId = currentCliSessionId(context);
  const task = context.services.delegation.create({
    title: input.title,
    objective: input.objective,
    group: "autocoder",
    profile: "native",
    priority: "normal",
    labels: ["autocoder", input.kind],
    metadata: {
      kind: input.kind,
      sessionId,
      projectName: input.projectName ?? "",
      repositoryName: input.repositoryName ?? "",
    },
    executionMode: "local",
  });
  context.services.delegation.markRunning(task.id);
  const workflow = context.services.autocoderPipeline.startWorkflow({
    title: input.title,
    objective: input.objective,
    kind: input.kind,
    projectName: input.projectName,
    repositoryName: input.repositoryName,
    sessionId,
    taskId: task.id,
  });
  context.services.delegation.addNote(
    task.id,
    `system: attached autocoder workflow ${workflow.id}`,
  );
  return {
    sessionId,
    taskId: task.id,
    workflowId: workflow.id,
  };
}

function completeAutocoderWorkflow(
  context: AgentExecutionContext,
  taskId: string,
  workflowId: string,
  note: string,
): void {
  context.services.delegation.complete(
    taskId,
    `${note} workflow=${workflowId}`,
  );
}

function failAutocoderWorkflow(
  context: AgentExecutionContext,
  taskId: string,
  workflowId: string,
  error: unknown,
): void {
  const message = error instanceof Error ? error.message : String(error);
  context.services.delegation.fail(taskId, `${message} workflow=${workflowId}`);
}

function parseTrajectoryArgs(raw: string): {
  sessionId?: string;
  role?: "user" | "assistant" | "system";
  limit?: number;
  label?: string;
  purpose?: string;
  mode?: "dataset" | "research" | "evaluation" | "rl";
  tags?: string[];
  notes?: string;
  rubric?: string[];
} {
  const options: {
    sessionId?: string;
    role?: "user" | "assistant" | "system";
    limit?: number;
    label?: string;
    purpose?: string;
    mode?: "dataset" | "research" | "evaluation" | "rl";
    tags?: string[];
    notes?: string;
    rubric?: string[];
  } = {};
  for (const token of raw.split(/\s+/u).filter(Boolean)) {
    if (token.startsWith("session:")) {
      options.sessionId = token.replace("session:", "").trim();
    } else if (token.startsWith("role:")) {
      const role = token.replace("role:", "").trim();
      if (role === "user" || role === "assistant" || role === "system") {
        options.role = role;
      }
    } else if (token.startsWith("limit:")) {
      const limit = Number(token.replace("limit:", "").trim());
      if (!Number.isNaN(limit) && limit > 0) {
        options.limit = limit;
      }
    } else if (token.startsWith("label:")) {
      options.label = token.replace("label:", "").trim();
    } else if (token.startsWith("purpose:")) {
      options.purpose = token.replace("purpose:", "").trim();
    } else if (token.startsWith("mode:")) {
      const mode = token.replace("mode:", "").trim();
      if (
        mode === "dataset" ||
        mode === "research" ||
        mode === "evaluation" ||
        mode === "rl"
      ) {
        options.mode = mode;
      }
    } else if (token.startsWith("tags:") || token.startsWith("tag:")) {
      options.tags = token
        .replace(/^tags?:/u, "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
    } else if (token.startsWith("notes:")) {
      options.notes = token.replace("notes:", "").trim();
    } else if (token.startsWith("rubric:")) {
      options.rubric = token
        .replace("rubric:", "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
  }
  return options;
}

function parseTrajectoryBenchmarkCases(raw: string): Array<{
  manifestPath?: string;
  label?: string;
}> {
  return raw
    .split("=>")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      if (entry.endsWith(".json")) {
        return { manifestPath: entry };
      }
      if (entry.startsWith("manifest:")) {
        return { manifestPath: entry.replace("manifest:", "").trim() };
      }
      if (entry.startsWith("label:")) {
        return { label: entry.replace("label:", "").trim() };
      }
      return { label: entry };
    });
}

function parseCronSegments(raw: string): {
  schedule: string;
  prompt: string;
  options: Record<string, string>;
} | null {
  const [left, prompt] = raw.split("::").map((part) => part.trim());
  if (!left || !prompt) {
    return null;
  }

  const segments = left
    .split("|")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (!segments.length) {
    return null;
  }

  const [schedule, ...rawOptions] = segments;
  const options = rawOptions.reduce<Record<string, string>>(
    (accumulator, segment) => {
      const separator = segment.indexOf(":");
      if (separator === -1) {
        return accumulator;
      }
      const key = segment.slice(0, separator).trim().toLowerCase();
      const value = segment.slice(separator + 1).trim();
      if (key && value) {
        accumulator[key] = value;
      }
      return accumulator;
    },
    {},
  );

  return {
    schedule,
    prompt,
    options,
  };
}

function parseCronRuntimeOptions(
  options: Record<string, string>,
): CronJobRuntimeOverrides | undefined {
  const runtime: CronJobRuntimeOverrides = {};

  if (options.provider) {
    runtime.provider = options.provider;
  }
  if (options.model) {
    runtime.model = options.model;
  }
  if (options.base || options.baseurl) {
    runtime.baseUrl = options.base ?? options.baseurl;
  }
  if (options.temperature) {
    const temperature = Number(options.temperature);
    if (!Number.isNaN(temperature)) {
      runtime.temperature = temperature;
    }
  }
  if (options.maxtokens) {
    const maxTokens = Number(options.maxtokens);
    if (!Number.isNaN(maxTokens)) {
      runtime.maxTokens = maxTokens;
    }
  }
  if (options.personality) {
    runtime.personalityId = options.personality;
  }

  return Object.keys(runtime).length ? runtime : undefined;
}

function parseCronSkills(value?: string): string[] | undefined {
  if (!value) {
    return undefined;
  }
  const skills = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return skills.length ? skills : [];
}

function parseCronDelivery(
  value?: string,
): "origin" | "local" | "home" | undefined {
  if (value === "origin" || value === "local" || value === "home") {
    return value;
  }
  return undefined;
}

function parseDelegationSegments(raw: string): {
  head: string;
  objective: string;
  options: Record<string, string>;
} | null {
  const [left, objective] = raw.split("::").map((part) => part.trim());
  if (!left || !objective) {
    return null;
  }

  const segments = left
    .split("|")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (!segments.length) {
    return null;
  }

  const [head, ...rawOptions] = segments;
  const options = rawOptions.reduce<Record<string, string>>(
    (accumulator, segment) => {
      const separator = segment.indexOf(":");
      if (separator === -1) {
        return accumulator;
      }
      const key = segment.slice(0, separator).trim().toLowerCase();
      const value = segment.slice(separator + 1).trim();
      if (key && value) {
        accumulator[key] = value;
      }
      return accumulator;
    },
    {},
  );

  return {
    head,
    objective,
    options,
  };
}

function parseDelegationSpawnSegments(raw: string): {
  parentId: string;
  objective: string;
  options: Record<string, string>;
} | null {
  const [left, objective] = raw.split("::").map((part) => part.trim());
  if (!left || !objective) {
    return null;
  }

  const segments = left
    .split("|")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (!segments.length) {
    return null;
  }

  const [parentId, ...rawOptions] = segments;
  const options = rawOptions.reduce<Record<string, string>>(
    (accumulator, segment) => {
      const separator = segment.indexOf(":");
      if (separator === -1) {
        return accumulator;
      }
      const key = segment.slice(0, separator).trim().toLowerCase();
      const value = segment.slice(separator + 1).trim();
      if (key && value) {
        accumulator[key] = value;
      }
      return accumulator;
    },
    {},
  );

  return {
    parentId,
    objective,
    options,
  };
}

function parseDelegationMetadata(
  value?: string,
): Record<string, string> | undefined {
  if (!value) {
    return undefined;
  }

  const metadata = value
    .split(",")
    .reduce<Record<string, string>>((accumulator, pair) => {
      const [rawKey, rawValue] = pair.split("=").map((part) => part.trim());
      if (rawKey && rawValue) {
        accumulator[rawKey] = rawValue;
      }
      return accumulator;
    }, {});

  return Object.keys(metadata).length ? metadata : undefined;
}

function parseDelegationLabels(value?: string): string[] | undefined {
  if (!value) {
    return undefined;
  }

  const labels = value
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean);

  return labels.length ? labels : [];
}

function parseDelegationFilter(raw: string): {
  limit?: number;
  concurrency?: number;
  group?: string;
  profile?: string;
  priority?: "low" | "normal" | "high";
  label?: string;
  parentTaskId?: string;
  status?: "pending" | "running" | "completed" | "failed" | "cancelled";
  executionMode?: "local" | "delegated";
} {
  const options: {
    limit?: number;
    concurrency?: number;
    group?: string;
    profile?: string;
    priority?: "low" | "normal" | "high";
    label?: string;
    parentTaskId?: string;
    status?: "pending" | "running" | "completed" | "failed" | "cancelled";
    executionMode?: "local" | "delegated";
  } = {};

  for (const token of raw.split(/\s+/u).filter(Boolean)) {
    if (token.startsWith("limit:") || token.startsWith("concurrency:")) {
      const value = Number(token.replace(/^(limit|concurrency):/u, ""));
      if (!Number.isNaN(value) && value > 0) {
        options.concurrency = value;
        options.limit = value;
      }
      continue;
    }
    if (token.startsWith("group:")) {
      options.group = token.replace("group:", "").trim();
      continue;
    }
    if (token.startsWith("profile:")) {
      options.profile = token.replace("profile:", "").trim();
      continue;
    }
    if (token.startsWith("priority:")) {
      const priority = token.replace("priority:", "").trim();
      if (priority === "low" || priority === "normal" || priority === "high") {
        options.priority = priority;
      }
      continue;
    }
    if (token.startsWith("label:") || token.startsWith("tag:")) {
      options.label = token.replace(/^(label|tag):/u, "").trim();
      continue;
    }
    if (token.startsWith("parent:") || token.startsWith("parentTaskId:")) {
      options.parentTaskId = token
        .replace(/^(parent|parentTaskId):/u, "")
        .trim();
      continue;
    }
    if (token.startsWith("status:")) {
      const status = token.replace("status:", "").trim();
      if (
        ["pending", "running", "completed", "failed", "cancelled"].includes(
          status,
        )
      ) {
        options.status = status as NonNullable<typeof options.status>;
      }
      continue;
    }
    if (token.startsWith("mode:") || token.startsWith("execution:")) {
      const executionMode = token.replace(/^(mode|execution):/u, "").trim();
      if (executionMode === "local" || executionMode === "delegated") {
        options.executionMode = executionMode;
      }
    }
  }

  if (
    !options.concurrency &&
    !Number.isNaN(Number(raw.trim())) &&
    Number(raw.trim()) > 0
  ) {
    options.concurrency = Number(raw.trim());
    options.limit = Number(raw.trim());
  }

  return options;
}

function applyRuntimeOverrides(
  settings: RuntimeSettings,
  runtime?: CronJobRuntimeOverrides,
): RuntimeSettings {
  if (!runtime) {
    return settings;
  }

  return {
    ...settings,
    model: {
      ...settings.model,
      provider: runtime.provider ?? settings.model.provider,
      model: runtime.model ?? settings.model.model,
      baseUrl: runtime.baseUrl ?? settings.model.baseUrl,
      temperature: runtime.temperature ?? settings.model.temperature,
      maxTokens: runtime.maxTokens ?? settings.model.maxTokens,
    },
  };
}

export async function runModelAnalysisTurn(
  context: AgentExecutionContext,
  prompt: string,
  label: string,
  options?: {
    userId?: string;
    roomId?: string;
    personalityId?: string;
    runtimeOverrides?: CronJobRuntimeOverrides;
  },
): Promise<string> {
  return handleAgentTurn(
    {
      message: prompt,
      userId: options?.userId ?? `analysis:${label}`,
      roomId: options?.roomId ?? `analysis:${label}`,
      source: "analysis",
    },
    context,
    options?.personalityId
      ? {
          personalityId: options.personalityId,
          runtimeOverrides: options.runtimeOverrides,
        }
      : {
          runtimeOverrides: options?.runtimeOverrides,
        },
  );
}

export async function runDelegationTaskInWorker(
  context: AgentExecutionContext,
  taskId: string,
  options?: { assumeRunning?: boolean },
): Promise<ReturnType<AgentExecutionContext["services"]["delegation"]["get"]>> {
  const task = context.services.delegation.get(taskId);
  const { inputPath, outputPath } = context.services.delegation.getWorkerPaths(
    task.id,
  );
  writeFileSync(
    inputPath,
    JSON.stringify(
      {
        taskId: task.id,
        objective: task.objective,
        group: task.group,
        profile: task.profile,
        priority: task.priority,
        tags: task.tags,
        labels: task.labels,
        metadata: task.metadata,
        parentTaskId: task.parentTaskId,
      },
      null,
      2,
    ),
    "utf8",
  );

  const workerEntry = join(import.meta.dir, "delegate-worker.ts");
  const proc = Bun.spawn({
    cmd: ["bun", "run", workerEntry, inputPath, outputPath],
    cwd: context.config.workspaceDir,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (!options?.assumeRunning) {
    context.services.delegation.markRunning(task.id);
  }
  context.services.delegation.markWorkerStarted(task.id, {
    pid: proc.pid,
    mode: "process",
    outputPath,
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  const rawOutput = readFileSync(outputPath, "utf8");
  const parsed = JSON.parse(rawOutput) as {
    ok: boolean;
    output?: string;
    error?: string;
    workerPid?: number;
    startedAt?: string;
    completedAt?: string;
    durationMs?: number;
  };

  if (exitCode === 0 && parsed.ok) {
    const completedTask = context.services.delegation.complete(
      task.id,
      parsed.output ?? (stdout.trim() || "Worker finished without output."),
    );
    context.services.delegation.addNote(
      task.id,
      `system: worker report pid=${parsed.workerPid ?? proc.pid} duration=${parsed.durationMs ?? "n/a"}ms output=${outputPath}`,
    );
    return completedTask;
  }

  const failedTask = context.services.delegation.fail(
    task.id,
    parsed.error ??
      (stderr.trim() || `Delegated worker failed with exit code ${exitCode}.`),
  );
  context.services.delegation.addNote(
    task.id,
    `system: worker failure pid=${parsed.workerPid ?? proc.pid} duration=${parsed.durationMs ?? "n/a"}ms output=${outputPath}`,
  );
  return failedTask;
}

export function syncProviderSettings(
  context: AgentExecutionContext,
  settings: ReturnType<AgentExecutionContext["services"]["settings"]["get"]>,
): void {
  context.runtime.setSetting("runtimeSettings", JSON.stringify(settings));

  const provider = settings.model.provider;
  const model = settings.model.model;
  const baseUrl = settings.model.baseUrl;

  if (provider === "anthropic" || provider === "claude-code") {
    context.runtime.setSetting("ANTHROPIC_SMALL_MODEL", model);
    context.runtime.setSetting("ANTHROPIC_LARGE_MODEL", model);
    context.runtime.setSetting("ANTHROPIC_BASE_URL", baseUrl);
    return;
  }

  context.runtime.setSetting("OPENAI_SMALL_MODEL", model);
  context.runtime.setSetting("OPENAI_LARGE_MODEL", model);
  context.runtime.setSetting(
    "OPENAI_BASE_URL",
    provider === "codex" ? "https://chatgpt.com/backend-api/codex" : baseUrl,
  );
}

export type LinkedProviderName = "codex" | "claude-code";

function resolveLinkedProviderName(
  raw: string | undefined,
): LinkedProviderName | undefined {
  const value = raw?.trim().toLowerCase();
  if (!value) {
    return undefined;
  }
  if (value === "codex") {
    return "codex";
  }
  if (value === "claude-code" || value === "claude" || value === "claudecode") {
    return "claude-code";
  }
  return undefined;
}

function defaultProviderModel(provider: LinkedProviderName): string {
  return provider === "codex" ? "gpt-5.4" : "claude-sonnet-4.6";
}

function defaultProviderBaseUrl(provider: LinkedProviderName): string {
  return provider === "codex" ? "https://chatgpt.com/backend-api/codex" : "";
}

async function getProviderReadinessMessage(
  context: AgentExecutionContext,
  provider: string,
): Promise<string | undefined> {
  const snapshot = getLinkedProviderAccountsSnapshot();

  if (provider === "openai" && !context.config.openAiApiKey?.trim()) {
    if (snapshot.codex.nativeReady || snapshot.codex.reusable) {
      return [
        "OpenAI is selected, but OPENAI_API_KEY is not configured.",
        "A linked Codex account is ready on this machine.",
        "Run `/accounts use codex` to activate it, or add OPENAI_API_KEY and try again.",
      ].join(" ");
    }
    return "OpenAI is selected, but OPENAI_API_KEY is not configured. Add it in `.env` or run `/accounts` to bind a linked provider.";
  }

  if (provider === "anthropic" && !context.config.anthropicApiKey?.trim()) {
    if (snapshot.claudeCode.nativeReady || snapshot.claudeCode.reusable) {
      return [
        "Anthropic is selected, but ANTHROPIC_API_KEY is not configured.",
        "A linked Claude Code account is ready on this machine.",
        "Run `/accounts use claude-code` to activate it, or add ANTHROPIC_API_KEY and try again.",
      ].join(" ");
    }
    return "Anthropic is selected, but ANTHROPIC_API_KEY is not configured. Add it in `.env` or run `/accounts` to bind a linked provider.";
  }

  if (provider === "codex") {
    const credentials = await resolveLinkedProviderCredentials("codex");
    if (!credentials?.accessToken) {
      return "Codex is selected, but no reusable Codex credentials are available. Run `/accounts connect codex` or `codex login`, then try again.";
    }
  }

  if (provider === "claude-code") {
    const credentials = await resolveLinkedProviderCredentials("claude-code");
    if (!credentials?.accessToken) {
      return "Claude Code is selected, but no native Claude Code credentials are available. Run `/accounts connect claude-code` or `claude setup-token`, then try again.";
    }
  }

  return undefined;
}

export function activateLinkedProvider(
  context: AgentExecutionContext,
  provider: LinkedProviderName,
): {
  provider: LinkedProviderName;
  model: string;
  baseUrl: string;
  accounts: ReturnType<typeof getLinkedProviderAccountsSnapshot>;
} {
  const settings = context.services.settings.get();
  const nextModel =
    settings.model.provider === provider && settings.model.model.trim()
      ? settings.model.model
      : defaultProviderModel(provider);
  const nextBaseUrl =
    settings.model.provider === provider
      ? settings.model.baseUrl
      : defaultProviderBaseUrl(provider);

  context.services.settings.set("model.provider", provider);
  context.services.settings.set("model.model", nextModel);
  context.services.settings.set("model.baseUrl", nextBaseUrl);
  const updated = context.services.settings.get();
  syncProviderSettings(context, updated);

  return {
    provider,
    model: updated.model.model,
    baseUrl: updated.model.baseUrl,
    accounts: getLinkedProviderAccountsSnapshot(),
  };
}

export async function connectLinkedProvider(
  context: AgentExecutionContext,
  provider: LinkedProviderName,
): Promise<{
  provider: LinkedProviderName;
  connected: boolean;
  activated: boolean;
  providerState?: ReturnType<typeof activateLinkedProvider>;
  advice: ReturnType<typeof getLinkedProviderConnectAdvice>;
  accounts: ReturnType<typeof getLinkedProviderAccountsSnapshot>;
}> {
  const settings = context.services.settings.get();
  const fallbackAllowed =
    provider === "claude-code" ? context.config.claudeCodeCliFallback : false;

  await refreshLinkedAccounts(provider);
  const accounts = getLinkedProviderAccountsSnapshot();
  const advice = getLinkedProviderConnectAdvice(provider);
  const status = provider === "codex" ? accounts.codex : accounts.claudeCode;
  const nativeReady = status.nativeReady ?? status.reusable;
  const fallbackReady = status.fallbackReady ?? false;
  const canActivate =
    nativeReady ||
    (provider === "claude-code" && fallbackAllowed && fallbackReady);

  if (!canActivate) {
    return {
      provider,
      connected: false,
      activated: false,
      advice,
      accounts,
    };
  }

  const providerState = activateLinkedProvider(context, provider);
  return {
    provider,
    connected: true,
    activated: settings.model.provider !== provider || canActivate,
    providerState,
    advice,
    accounts: providerState.accounts,
  };
}

export async function refreshLinkedAccounts(
  provider?: LinkedProviderName | "all",
): Promise<ReturnType<typeof getLinkedProviderAccountsSnapshot>> {
  if (!provider || provider === "all") {
    await Promise.all([
      resolveLinkedProviderCredentials("codex").catch(() => undefined),
      resolveLinkedProviderCredentials("claude-code").catch(() => undefined),
      refreshLinkedCodexCredentials().catch(() => undefined),
      refreshLinkedClaudeCodeCredentials().catch(() => undefined),
    ]);
    return getLinkedProviderAccountsSnapshot();
  }

  if (provider === "codex") {
    await resolveLinkedProviderCredentials("codex");
    await refreshLinkedCodexCredentials();
    return getLinkedProviderAccountsSnapshot();
  }

  await resolveLinkedProviderCredentials("claude-code");
  await refreshLinkedClaudeCodeCredentials();
  return getLinkedProviderAccountsSnapshot();
}

async function buildCommandResponse(
  input: ChatTurnRequest,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  const { message } = input;
  const trimmed = message.trim();
  const sessionKey = input.roomId ?? `room:${input.userId}`;
  const nativeServices = getNativeServices(context.runtime);

  if (trimmed.startsWith("/memory")) {
    const target: MemoryTarget =
      trimmed.includes(" user ") || trimmed.endsWith(" user")
        ? "user"
        : "memory";
    if (
      trimmed === "/memory summary" ||
      trimmed === `/memory summary ${target}`
    ) {
      return JSON.stringify(
        getEffectiveMemorySnapshot(context.runtime, context.services, target),
        null,
        2,
      );
    }
    if (
      trimmed === "/memory" ||
      trimmed === "/memory list" ||
      trimmed === `/memory list ${target}`
    ) {
      return [
        context.services.memory.renderSnapshot(target),
        "",
        `Summary: ${formatMemorySummary(
          getEffectiveMemorySnapshot(context.runtime, context.services, target),
        )}`,
      ].join("\n");
    }
  }

  if (trimmed === "/user" || trimmed === "/user profile") {
    const nativeCard = nativeServices.rolodex?.card(input.userId);
    if (nativeCard) {
      return typeof nativeCard === "string"
        ? nativeCard
        : JSON.stringify(nativeCard, null, 2);
    }
    return context.services.userProfiles.render(input.userId);
  }

  if (trimmed === "/user beliefs") {
    return JSON.stringify(
      getEffectiveUserBeliefs(context.runtime, context.services, input.userId),
      null,
      2,
    );
  }

  if (trimmed === "/user relationship") {
    return JSON.stringify(
      getEffectiveUserRelationship(
        context.runtime,
        context.services,
        input.userId,
      ),
      null,
      2,
    );
  }

  if (trimmed === "/user engagement") {
    return JSON.stringify(
      getEffectiveUserEngagement(
        context.runtime,
        context.services,
        input.userId,
      ),
      null,
      2,
    );
  }

  if (
    trimmed === "/profiles summary" ||
    trimmed === "/profiles users summary"
  ) {
    return JSON.stringify(
      getEffectiveUserProfileSummary(context.runtime, context.services),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/user search ")) {
    const query = trimmed.replace("/user search ", "").trim();
    if (!query) {
      return "Usage: /user search <query>";
    }
    return JSON.stringify(
      getEffectiveUserProfileSearch(context.runtime, context.services, query),
      null,
      2,
    );
  }

  if (trimmed === "/user card" || trimmed === "/profiles card") {
    const nativeCard = nativeServices.rolodex?.card(input.userId);
    if (nativeCard) {
      return typeof nativeCard === "string"
        ? nativeCard
        : JSON.stringify(nativeCard, null, 2);
    }
    return context.services.userProfiles.renderCards(input.userId);
  }

  if (trimmed === "/agent profile") {
    const nativeProfile = nativeServices.rolodex?.agentProfile();
    if (nativeProfile) {
      return typeof nativeProfile === "string"
        ? nativeProfile
        : JSON.stringify(nativeProfile, null, 2);
    }
    return context.services.userProfiles.renderAgent();
  }

  if (trimmed.startsWith("/user recall ")) {
    const query = trimmed.replace("/user recall ", "").trim();
    if (!query) {
      return "Usage: /user recall <query>";
    }
    return JSON.stringify(
      nativeServices.rolodex?.recall(input.userId, query) ??
        context.services.userProfiles.recall(input.userId, query),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/user context ")) {
    const query = trimmed.replace("/user context ", "").trim();
    if (!query) {
      return "Usage: /user context <question>";
    }
    return JSON.stringify(
      context.services.userProfiles.context(input.userId, query),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/user conclude ")) {
    const payload = trimmed.replace("/user conclude ", "");
    const [queryRaw, ...conclusionParts] = payload.split("::");
    const query = queryRaw?.trim();
    const conclusion = conclusionParts.join("::").trim();
    if (!query || !conclusion) {
      return "Usage: /user conclude <question> :: <conclusion>";
    }
    return JSON.stringify(
      {
        context: context.services.userProfiles.context(input.userId, query),
        conclusion: context.services.userProfiles.conclude(
          input.userId,
          query,
          conclusion,
          input.source,
        ),
      },
      null,
      2,
    );
  }

  if (trimmed.startsWith("/profiles users search ")) {
    const query = trimmed.replace("/profiles users search ", "").trim();
    if (!query) {
      return "Usage: /profiles users search <query>";
    }
    return JSON.stringify(
      getEffectiveUserProfileSearch(context.runtime, context.services, query),
      null,
      2,
    );
  }

  if (trimmed === "/user list") {
    const profiles = context.services.userProfiles.list().slice(0, 20);
    return profiles.length
      ? profiles
          .map(
            (profile) =>
              `- ${profile.displayName ?? profile.userId}: prefs=${profile.preferences.length} facts=${profile.facts.length} notes=${profile.notes.length}`,
          )
          .join("\n")
      : "No user profiles recorded.";
  }

  if (trimmed.startsWith("/user note ")) {
    const note = trimmed.replace("/user note ", "").trim();
    if (!note) {
      return "Usage: /user note <text>";
    }
    return JSON.stringify(
      nativeServices.rolodex?.remember(
        input.userId,
        "note",
        note,
        input.source,
      ) ??
        context.services.userProfiles.addNote(input.userId, note, input.source),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/user mode ")) {
    const mode = trimmed.replace("/user mode ", "").trim();
    if (mode !== "local" && mode !== "hybrid") {
      return "Usage: /user mode <local|hybrid>";
    }
    return JSON.stringify(
      context.services.userProfiles.setMode(input.userId, mode),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/user modeling ")) {
    const payload = trimmed.replace("/user modeling ", "");
    const segments = payload
      .split("|")
      .map((entry) => entry.trim())
      .filter(Boolean);
    const settings: {
      userMemoryMode?: "local" | "hybrid";
      assistantMemoryMode?: "local" | "hybrid";
      dialecticMode?: "off" | "assist" | "conclude";
    } = {};
    for (const segment of segments) {
      const [key, value] = segment.split(":").map((entry) => entry.trim());
      if (!key || !value) {
        continue;
      }
      if (
        (key === "user" || key === "userMemory") &&
        (value === "local" || value === "hybrid")
      ) {
        settings.userMemoryMode = value;
      } else if (
        (key === "assistant" || key === "assistantMemory") &&
        (value === "local" || value === "hybrid")
      ) {
        settings.assistantMemoryMode = value;
      } else if (
        (key === "dialectic" || key === "mode") &&
        (value === "off" || value === "assist" || value === "conclude")
      ) {
        settings.dialecticMode = value;
      }
    }
    if (
      !settings.userMemoryMode &&
      !settings.assistantMemoryMode &&
      !settings.dialecticMode
    ) {
      return "Usage: /user modeling user:<local|hybrid> | assistant:<local|hybrid> | dialectic:<off|assist|conclude>";
    }
    return JSON.stringify(
      context.services.userProfiles.configureModeling(input.userId, settings),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/user remember ")) {
    const payload = trimmed.replace("/user remember ", "");
    const [kindRaw, ...valueParts] = payload.split("::");
    const kind = kindRaw?.trim();
    const value = valueParts.join("::").trim();
    if (!kind || !value) {
      return "Usage: /user remember <preference|fact|belief|goal|context|constraint|relationship|note|memory> :: <text>";
    }
    if (
      ![
        "preference",
        "fact",
        "belief",
        "goal",
        "context",
        "constraint",
        "relationship",
        "note",
        "memory",
      ].includes(kind)
    ) {
      return "Usage: /user remember <preference|fact|belief|goal|context|constraint|relationship|note|memory> :: <text>";
    }
    return JSON.stringify(
      nativeServices.rolodex?.remember(
        input.userId,
        kind,
        value,
        input.source,
      ) ??
        context.services.userProfiles.remember(
          input.userId,
          kind as
            | "preference"
            | "fact"
            | "goal"
            | "context"
            | "constraint"
            | "note"
            | "memory",
          value,
          input.source,
        ),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/agent observe ")) {
    const note = trimmed.replace("/agent observe ", "").trim();
    if (!note) {
      return "Usage: /agent observe <text>";
    }
    return JSON.stringify(
      nativeServices.rolodex?.observeAgent(note, input.source) ??
        context.services.userProfiles.observeAgent(note, input.source),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/agent seed ")) {
    const raw = trimmed.replace("/agent seed ", "").trim();
    if (!raw) {
      return "Usage: /agent seed name:Eliza Agent | goals:a,b | strengths:x,y | style:m,n | notes:p,q";
    }
    const seed: {
      name?: string;
      goals?: string[];
      strengths?: string[];
      workStyle?: string[];
      notes?: string[];
    } = {};
    for (const segment of raw.split("|").map((part) => part.trim())) {
      const [key, value] = segment.split(":").map((part) => part.trim());
      if (!key || !value) {
        continue;
      }
      if (key === "name") {
        seed.name = value;
      } else if (key === "goals" || key === "goal") {
        seed.goals = value
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean);
      } else if (key === "strengths" || key === "strength") {
        seed.strengths = value
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean);
      } else if (key === "style" || key === "workStyle") {
        seed.workStyle = value
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean);
      } else if (key === "notes" || key === "note") {
        seed.notes = value
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean);
      }
    }
    return JSON.stringify(
      context.services.userProfiles.seedAgent(seed),
      null,
      2,
    );
  }

  if (trimmed === "/skills" || trimmed === "/skills list") {
    const skills = getEffectiveSkills(
      context.runtime,
      context.services,
    ) as Array<{
      slug: string;
      description?: string;
    }>;
    const workspace = getEffectiveSkillHubWorkspace(context.services) as Array<{
      slug: string;
      title: string;
      description: string;
      source: string;
      manifestPath: string;
    }>;
    return [
      `workspace=${workspace.length} generated=${getEffectiveSkillHubGenerated(context.services).length} installed=${getEffectiveSkillHubInstalled(context.services).length}`,
      "",
      skills.length
        ? skills
            .map(
              (skill) =>
                `- ${skill.slug}: ${skill.description ?? "No description available."}`,
            )
            .join("\n")
        : "No skills found.",
    ].join("\n");
  }

  if (trimmed === "/skills summary") {
    return JSON.stringify(
      {
        workspace: getEffectiveSkillsSummary(context.runtime, context.services),
        hub: getEffectiveSkillHubSummary(context.services),
        installed: getEffectiveSkillHubInstalled(context.services),
      },
      null,
      2,
    );
  }

  if (trimmed === "/skills hub") {
    return JSON.stringify(
      getEffectiveSkillHubSummary(context.services),
      null,
      2,
    );
  }

  if (trimmed === "/skills hub distribution") {
    return JSON.stringify(
      getEffectiveSkillHubSummary(context.services).distribution,
      null,
      2,
    );
  }

  if (trimmed === "/skills families") {
    return JSON.stringify(
      getEffectiveSkillHubFamilies(context.services, 50),
      null,
      2,
    );
  }

  if (trimmed === "/skills hub families") {
    return JSON.stringify(
      getEffectiveSkillHubFamilies(context.services, 50),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/skills family ")) {
    const slug = trimmed.replace("/skills family ", "").trim();
    if (!slug) {
      return "Usage: /skills family <slug>";
    }
    return JSON.stringify(
      getEffectiveSkillHubFamily(context.services, slug) ?? {
        error: `Skill family not found: ${slug}`,
      },
      null,
      2,
    );
  }

  if (trimmed === "/skills installed") {
    return JSON.stringify(
      getEffectiveSkillHubInstalled(context.services),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/skills installed show ")) {
    const slug = trimmed.replace("/skills installed show ", "").trim();
    if (!slug) {
      return "Usage: /skills installed show <slug>";
    }
    return JSON.stringify(
      getEffectiveSkillHubInstalledManifest(context.services, slug) ?? {
        error: `Installed skill manifest not found: ${slug}`,
      },
      null,
      2,
    );
  }

  if (trimmed === "/skills catalog") {
    return JSON.stringify(
      await getEffectiveSkillHubCatalog(context.services, false, 50),
      null,
      2,
    );
  }

  if (trimmed === "/skills catalog refresh") {
    return JSON.stringify(
      await getEffectiveSkillHubCatalog(context.services, true, 50),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/skills catalog search ")) {
    const query = trimmed.replace("/skills catalog search ", "").trim();
    if (!query) {
      return "Usage: /skills catalog search <query>";
    }
    return JSON.stringify(
      await searchEffectiveSkillHubCatalog(context.services, query),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/skills catalog show ")) {
    const slug = trimmed.replace("/skills catalog show ", "").trim();
    if (!slug) {
      return "Usage: /skills catalog show <slug>";
    }
    return JSON.stringify(
      (await context.services.skillsHub.catalogEntry(slug)) ?? {
        error: `Catalog skill not found: ${slug}`,
      },
      null,
      2,
    );
  }

  if (trimmed === "/skills sync" || trimmed === "/skills sync refresh") {
    return JSON.stringify(
      await syncEffectiveSkillHub(context.services, true),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/skills manifest ")) {
    const slug = trimmed.replace("/skills manifest ", "").trim();
    if (!slug) {
      return "Usage: /skills manifest <slug>";
    }
    return JSON.stringify(
      context.services.skillsHub.manifest(slug) ?? {
        error: `Skill manifest not found: ${slug}`,
      },
      null,
      2,
    );
  }

  if (trimmed.startsWith("/skills export ")) {
    const raw = trimmed.replace("/skills export ", "").trim();
    if (!raw) {
      return "Usage: /skills export <slug|all>";
    }
    if (raw === "all") {
      return JSON.stringify(
        await context.services.skillsHub.exportBundle("skills-hub"),
        null,
        2,
      );
    }
    return JSON.stringify(
      exportEffectiveSkillHubManifest(context.services, raw),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/skills import ")) {
    const sourcePath = trimmed.replace("/skills import ", "").trim();
    if (!sourcePath) {
      return "Usage: /skills import <manifest-path>";
    }
    return JSON.stringify(
      importEffectiveSkillHubManifest(context.services, sourcePath),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/skills install ")) {
    const slug = trimmed.replace("/skills install ", "").trim();
    if (!slug) {
      return "Usage: /skills install <catalog-slug>";
    }
    return JSON.stringify(
      await installEffectiveSkillHubManifest(context.services, slug),
      null,
      2,
    );
  }

  if (trimmed === "/skills generated" || trimmed === "/skills generated list") {
    const generated = getEffectiveGeneratedSkills(
      context.runtime,
      context.services,
    ) as Array<{
      slug?: string;
      updatedAt?: string;
      noteCount?: number;
      signalCount?: number;
      title?: string;
      path?: string;
    }>;
    return generated.length
      ? generated
          .map(
            (skill) =>
              `- ${skill.slug ?? "unknown"} [${skill.updatedAt ?? "n/a"}] notes=${skill.noteCount ?? 0} signals=${skill.signalCount ?? 0}\n  ${skill.title ?? "Untitled"}\n  ${skill.path ?? "n/a"}`,
          )
          .join("\n\n")
      : "No generated skills recorded.";
  }

  if (trimmed.startsWith("/skills generated show ")) {
    const slug = trimmed.replace("/skills generated show ", "").trim();
    if (!slug) {
      return "Usage: /skills generated show <slug>";
    }
    return JSON.stringify(
      context.services.skillSynthesis.getGeneratedSkill(slug) ?? {
        error: `Generated skill not found: ${slug}`,
      },
      null,
      2,
    );
  }

  if (trimmed.startsWith("/skills generated describe ")) {
    const slug = trimmed.replace("/skills generated describe ", "").trim();
    if (!slug) {
      return "Usage: /skills generated describe <slug>";
    }
    return context.services.skillSynthesis.describeGeneratedSkill(slug);
  }

  if (trimmed.startsWith("/skills show ")) {
    const slug = trimmed.replace("/skills show ", "").trim();
    const skill =
      (getNativeServices(context.runtime).agentSkills?.get(slug) as
        | { content?: string }
        | undefined) ?? context.services.skills.get(slug);
    return skill ? skill.content : `Skill not found: ${slug}`;
  }

  if (trimmed.startsWith("/search ")) {
    const query = trimmed.replace("/search ", "").trim();
    const matches = context.services.sessions.search(
      query,
      context.config.sessionSearchLimit,
    );
    return matches.length
      ? matches
          .map(
            (match) =>
              `- [${match.createdAt}] (${match.role}) session=${match.sessionId}: ${match.text}`,
          )
          .join("\n")
      : "No prior session matches found.";
  }

  if (trimmed === "/sessions" || trimmed === "/sessions list") {
    const sessions = context.services.sessions.listSessions(10);
    return sessions.length
      ? sessions
          .map(
            (session) =>
              `- ${session.sessionId} messages=${session.messageCount} started=${session.startedAt ?? "n/a"} ended=${session.endedAt ?? "n/a"} participants=${session.participants.join(",") || "none"}`,
          )
          .join("\n")
      : "No sessions recorded.";
  }

  if (trimmed.startsWith("/queue ")) {
    const objective = trimmed.replace("/queue ", "").trim();
    if (!objective) {
      return "Usage: /queue <prompt>";
    }
    return JSON.stringify(
      context.services.delegation.create({
        title: `Queued prompt ${new Date().toISOString()}`,
        objective,
        group: "queued-prompts",
        profile: "queued",
        priority: "normal",
        labels: ["queue", "prompt"],
        metadata: {
          source: input.source ?? "cli",
          userId: input.userId,
          roomId: input.roomId ?? `room:${input.userId}`,
        },
        executionMode: "local",
      }),
      null,
      2,
    );
  }

  if (trimmed === "/resume") {
    const titled = context.services.sessions.listTitled(10);
    return titled.length
      ? titled
          .map(
            (session) =>
              `- ${session.title ?? "(untitled)"}\n  session=${session.sessionId} messages=${session.messageCount} ended=${session.endedAt ?? "n/a"}`,
          )
          .join("\n")
      : "No titled sessions are available yet. Use /title <name> to name the current session.";
  }

  if (trimmed.startsWith("/resume ")) {
    const query = trimmed.replace("/resume ", "").trim();
    if (!query) {
      return "Usage: /resume <session title>";
    }
    const target = context.services.sessions.resolveByTitle(query);
    if (!target) {
      return `Session not found for title: ${query}`;
    }
    const currentRoute = context.services.gatewaySessions.get(sessionKey);
    if (currentRoute) {
      context.services.gatewaySessions.setActiveAgentSession(
        sessionKey,
        target.sessionId,
      );
      return `Resumed session ${target.title ?? target.sessionId}. New messages on this route will continue in ${target.sessionId}.`;
    }
    return JSON.stringify(target, null, 2);
  }

  if (trimmed.startsWith("/title ")) {
    const title = trimmed.replace("/title ", "").trim();
    if (!title) {
      return "Usage: /title <name>";
    }
    return JSON.stringify(
      context.services.sessions.rename(sessionKey, title),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/session title ")) {
    const payload = trimmed.replace("/session title ", "").trim();
    const [sessionId, title] = payload.split("::").map((part) => part.trim());
    if (!sessionId || !title) {
      return "Usage: /session title <session-id> :: <title>";
    }
    return JSON.stringify(
      context.services.sessions.rename(sessionId, title),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/session continuity ")) {
    const sessionId = trimmed.replace("/session continuity ", "").trim();
    if (!sessionId) {
      return "Usage: /session continuity <session-id>";
    }
    return JSON.stringify(
      context.services.sessions.continuity(sessionId),
      null,
      2,
    );
  }

  if (trimmed === "/session summary") {
    return JSON.stringify(
      context.services.sessions.summarize(sessionKey),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/session summary ")) {
    const sessionId = trimmed.replace("/session summary ", "").trim();
    if (!sessionId) {
      return "Usage: /session summary <session-id>";
    }
    return JSON.stringify(
      context.services.sessions.summarize(sessionId),
      null,
      2,
    );
  }

  if (trimmed === "/usage") {
    return JSON.stringify(context.services.sessions.usage(sessionKey), null, 2);
  }

  if (trimmed.startsWith("/usage ")) {
    const target = trimmed.replace("/usage ", "").trim();
    if (!target) {
      return "Usage: /usage <session-id|session-title>";
    }
    const resolved =
      context.services.sessions.resolveByTitle(target)?.sessionId ?? target;
    return JSON.stringify(context.services.sessions.usage(resolved), null, 2);
  }

  if (trimmed === "/cron" || trimmed === "/cron list") {
    const jobs =
      (getNativeServices(context.runtime).cron?.list() as Array<{
        id: string;
        name: string;
        status: string;
        schedule: string;
        nextRunAt?: string;
        skills?: string[];
        runtime?: { model?: string; personalityId?: string };
      }>) ?? context.services.cron.list();
    return jobs.length
      ? jobs
          .map(
            (job) =>
              `- ${job.id} ${job.name} [${job.status}] schedule="${job.schedule}" next=${job.nextRunAt ?? "n/a"} skills=${(job.skills ?? []).join(",") || "none"} model=${job.runtime?.model ?? "default"} personality=${job.runtime?.personalityId ?? "active"}`,
          )
          .join("\n")
      : "No cron jobs configured.";
  }

  if (trimmed === "/cron runs") {
    const runs =
      (getNativeServices(context.runtime).cron?.runs(10) as Array<{
        jobName: string;
        createdAt: string;
        outputPath?: string;
        output: string;
      }>) ?? context.services.cron.recentRuns(10);
    return runs.length
      ? runs
          .map(
            (run) =>
              `- ${run.jobName} [${run.createdAt}]${run.outputPath ? ` output=${run.outputPath}` : ""}\n${run.output.slice(0, 240)}`,
          )
          .join("\n\n")
      : "No cron runs recorded.";
  }

  if (trimmed.startsWith("/cron create ")) {
    const payload = trimmed.replace("/cron create ", "");
    const parsed = parseCronSegments(payload);
    if (!parsed) {
      return "Usage: /cron create <schedule> | name:nightly | skills:slug-a,slug-b | personality:focus | provider:openai | model:gpt-5.4 :: <prompt>";
    }

    const created = context.services.cron.create({
      name: parsed.options.name ?? `job-${Date.now()}`,
      schedule: parsed.schedule,
      prompt: parsed.prompt,
      skills: parseCronSkills(parsed.options.skills),
      runtime: parseCronRuntimeOptions(parsed.options),
      delivery:
        parseCronDelivery(parsed.options.delivery) ??
        (input.source === "cron" ? "local" : "origin"),
    });
    return `Created cron job ${created.id} with next run ${created.nextRunAt ?? "n/a"}.`;
  }

  if (trimmed.startsWith("/cron show ")) {
    const job = context.services.cron.get(
      trimmed.replace("/cron show ", "").trim(),
    );
    if (!job) {
      return "Cron job not found.";
    }
    return JSON.stringify(job, null, 2);
  }

  if (trimmed.startsWith("/cron update ")) {
    const payload = trimmed.replace("/cron update ", "").trim();
    const firstSpace = payload.indexOf(" ");
    if (firstSpace === -1) {
      return "Usage: /cron update <job-id> <schedule> | name:nightly | skills:slug-a,slug-b | personality:focus | provider:openai | model:gpt-5.4 :: <prompt>";
    }
    const id = payload.slice(0, firstSpace).trim();
    const rest = payload.slice(firstSpace + 1).trim();
    const parsed = parseCronSegments(rest);
    if (!id || !parsed) {
      return "Usage: /cron update <job-id> <schedule> | name:nightly | skills:slug-a,slug-b | personality:focus | provider:openai | model:gpt-5.4 :: <prompt>";
    }
    const updated = context.services.cron.updateConfig(id, {
      name: parsed.options.name,
      schedule: parsed.schedule,
      prompt: parsed.prompt,
      skills: parseCronSkills(parsed.options.skills),
      runtime: parseCronRuntimeOptions(parsed.options),
      clearRuntime: parsed.options.runtime === "default",
      delivery: parseCronDelivery(parsed.options.delivery),
    });
    return `Updated cron job ${updated.id}; next run ${updated.nextRunAt ?? "n/a"}.`;
  }

  if (trimmed.startsWith("/cron pause ")) {
    const job = context.services.cron.pause(
      trimmed.replace("/cron pause ", "").trim(),
    );
    return `Paused ${job.id}.`;
  }

  if (trimmed.startsWith("/cron resume ")) {
    const job = context.services.cron.resume(
      trimmed.replace("/cron resume ", "").trim(),
    );
    return `Resumed ${job.id}; next run ${job.nextRunAt ?? "n/a"}.`;
  }

  if (trimmed.startsWith("/cron run ")) {
    const job = context.services.cron.runNow(
      trimmed.replace("/cron run ", "").trim(),
    );
    return `Marked ${job.id} to run immediately.`;
  }

  if (trimmed.startsWith("/cron remove ")) {
    const id = trimmed.replace("/cron remove ", "").trim();
    context.services.cron.remove(id);
    return `Removed ${id}.`;
  }

  if (trimmed === "/personality" || trimmed === "/personality status") {
    const active = context.services.personalities.getActive();
    return [
      `${active.name} (${active.id})`,
      active.description,
      active.systemAddendum,
      `Summary: ${formatPersonalitySummary(
        getEffectivePersonalitySummary(context.runtime, context.services),
      )}`,
    ].join("\n");
  }

  if (trimmed === "/personality list") {
    return (
      getEffectivePersonalityList(context.runtime, context.services) as Array<{
        id: string;
        description: string;
      }>
    )
      .map((profile) => `- ${profile.id}: ${profile.description}`)
      .join("\n");
  }

  if (trimmed.startsWith("/personality set ")) {
    const id = trimmed.replace("/personality set ", "").trim();
    const profile =
      (getNativeServices(context.runtime).personality?.activate(id) as
        | { id: string; name: string }
        | undefined) ?? context.services.personalities.setActive(id);
    return `Active personality set to ${profile.name}.`;
  }

  if (trimmed === "/personality summary") {
    return JSON.stringify(
      getEffectivePersonalitySummary(context.runtime, context.services),
      null,
      2,
    );
  }

  if (trimmed === "/experience" || trimmed === "/experience summary") {
    return JSON.stringify(
      getEffectiveExperienceSummary(context.runtime, context.services),
      null,
      2,
    );
  }

  if (trimmed === "/context" || trimmed === "/context files") {
    return context.services.contextFiles.render();
  }

  if (trimmed === "/workspace" || trimmed === "/workspace tree") {
    return context.services.workspace.summary(40);
  }

  if (trimmed.startsWith("/workspace read ")) {
    const path = trimmed.replace("/workspace read ", "").trim();
    return context.services.workspace.read(path);
  }

  if (trimmed.startsWith("/workspace search ")) {
    const query = trimmed.replace("/workspace search ", "").trim();
    const results = context.services.workspace.search(query, 20);
    return results.length
      ? results
          .map(
            (result) =>
              `${result.path}\n${result.matches.map((line) => `  ${line}`).join("\n")}`,
          )
          .join("\n\n")
      : "No workspace matches found.";
  }

  if (trimmed.startsWith("/workspace write ")) {
    const payload = trimmed.replace("/workspace write ", "");
    const [path, ...contentParts] = payload.split("::");
    const relativePath = path?.trim();
    const content = contentParts.join("::").trim();
    if (!relativePath || !content) {
      return "Usage: /workspace write <path> :: <content>";
    }
    const writtenPath = context.services.workspace.write(relativePath, content);
    return `Wrote ${writtenPath}.`;
  }

  if (trimmed === "/status") {
    const personality = context.services.personalities.getActive();
    const settings = context.services.settings.get();
    const ownership =
      context.services.nativeOwnership.controlPlane() ??
      getNativeOwnershipControlPlane(
        context.runtime,
        context.services,
        context.config,
        context.services.gatewayConfig,
      );
    const controlPlane = ownership.transportControl;
    const memorySummary = getEffectiveMemorySnapshot(
      context.runtime,
      context.services,
      "memory",
    );
    if (!ownership.identity) {
      return [
        `Agent: ${context.config.agentName}`,
        `Personality: ${personality.name}`,
        `Personality summary: n/a`,
        `Provider: ${settings.model.provider}`,
        `Model: ${settings.model.model}`,
        `Transport inventory: ${controlPlane.totals.operationalTransports}/${controlPlane.transportInventory.length} operational`,
        `Gateway bridges: ${controlPlane.totals.liveServices}/${controlPlane.totals.gatewayEnabled} live`,
        `Memory summary: ${formatMemorySummary(memorySummary)}`,
        `Profiles summary: n/a`,
        `Experience summary: n/a`,
      ].join("\n");
    }
    const identity = ownership.identity;
    return [
      `Agent: ${context.config.agentName}`,
      `Personality: ${personality.name}`,
      `Personality summary: ${formatPersonalitySummary(identity.personality)}`,
      `Provider: ${settings.model.provider}`,
      `Model: ${settings.model.model}`,
      `Transport inventory: ${controlPlane.totals.operationalTransports}/${controlPlane.transportInventory.length} operational`,
      `Gateway bridges: ${controlPlane.totals.liveServices}/${controlPlane.totals.gatewayEnabled} live`,
      `Memory summary: ${formatMemorySummary(memorySummary)}`,
      `Profiles summary: ${formatRolodexSummary(identity.rolodex)}`,
      `Experience summary: ${formatExperienceSummary(identity.experience)}`,
      `Native ownership: services=${ownership.serviceResolution.length} plugins=${ownership.pluginManager?.summary.enabled ?? 0}`,
      `Skills: ${context.services.skills.list().length}`,
      `Cron jobs: ${context.services.cron.list().length}`,
      `Gateway sessions: ${context.services.gatewaySessions.list().length}`,
    ].join("\n");
  }

  if (trimmed === "/gateway readiness") {
    if (!context.gateway) {
      return "Gateway runtime is not attached to this execution context.";
    }
    const health = await context.gateway.health();
    const controlPlane = getNativeTransportControlPlane(
      context.runtime,
      context.config,
      context.services.gatewayConfig,
    );
    const pluginLines = groupNativePluginCatalog(
      getNativePluginCatalog(context.config),
    ).messaging.map(
      (entry) =>
        `- plugin ${entry.id} [${entry.enabled ? "enabled" : "disabled"}] source=${entry.source} :: ${entry.notes}`,
    );
    const bridgeLines = controlPlane.messagingBridge.map(
      (entry) =>
        `- bridge ${entry.platform} config=${entry.configEnabled} gateway=${entry.gatewayEnabled} service=${entry.serviceName} available=${entry.serviceAvailable} live=${entry.live} plugin=${entry.pluginId ?? "n/a"} reason=${entry.reason} :: ${entry.detail}`,
    );
    const transportLines = controlPlane.transportInventory
      .filter(
        (entry) =>
          entry.platform !== "telegram" && entry.platform !== "discord",
      )
      .map(
        (entry) =>
          `- transport ${entry.platform} source=${entry.source} config=${entry.configEnabled} gateway=${entry.gatewayEnabled} op=${entry.operational} reason=${entry.reason} :: ${entry.detail}`,
      );
    return [
      `gateway totals: configured=${health.length} ready=${health.filter((entry) => entry.ready).length} pluginMediated=${health.filter((entry) => entry.nativePluginId).length} official=${health.filter((entry) => entry.nativePluginSource === "official").length} vendored=${health.filter((entry) => entry.nativePluginSource === "vendored").length}`,
      `bridge totals: gatewayEnabled=${controlPlane.totals.gatewayEnabled} pluginEnabled=${controlPlane.totals.enabledPlugins} available=${controlPlane.totals.availableServices} live=${controlPlane.totals.liveServices} operational=${controlPlane.totals.operationalTransports}`,
      ...health.map((entry) => {
        const lifecycle = [
          entry.startedAt ? `started=${entry.startedAt}` : undefined,
          entry.stoppedAt ? `stopped=${entry.stoppedAt}` : undefined,
          entry.lastSendAt ? `lastSend=${entry.lastSendAt}` : undefined,
          entry.sendCount !== undefined
            ? `sends=${entry.sendCount}`
            : undefined,
          entry.lastError ? `error=${entry.lastError}` : undefined,
          `events=${entry.events.length}`,
          entry.events[0] ? `lastEvent=${entry.events[0].kind}` : undefined,
          entry.nativePluginId ? `plugin=${entry.nativePluginId}` : undefined,
          entry.nativePluginSource
            ? `pluginSource=${entry.nativePluginSource}`
            : undefined,
        ]
          .filter(Boolean)
          .join(" ");
        return `- ${entry.platform} [${entry.status}] ready=${entry.ready} mode=${entry.mode} inbound=${entry.capabilities.inbound} outbound=${entry.capabilities.outbound} edits=${entry.capabilities.edits}${lifecycle ? ` ${lifecycle}` : ""} :: ${entry.detail}`;
      }),
      ...bridgeLines,
      ...transportLines,
      ...pluginLines,
    ].join("\n");
  }

  if (trimmed === "/transport inventory" || trimmed === "/gateway transports") {
    const controlPlane = getNativeTransportControlPlane(
      context.runtime,
      context.config,
      context.services.gatewayConfig,
    );
    return summarizeTransportInventory(controlPlane.transportInventory, "chat");
  }

  if (trimmed === "/transport status") {
    const controlPlane = getNativeTransportControlPlane(
      context.runtime,
      context.config,
      context.services.gatewayConfig,
    );
    return [
      `transport status: operational=${controlPlane.totals.operationalTransports}/${controlPlane.transportInventory.length} live=${controlPlane.totals.liveServices} gatewayEnabled=${controlPlane.totals.gatewayEnabled} pluginEnabled=${controlPlane.totals.enabledPlugins}`,
      `native services: available=${controlPlane.totals.availableServices} product=${controlPlane.totals.productTransports} custom=${controlPlane.totals.customTransports}`,
      summarizeTransportInventory(controlPlane.transportInventory, "chat"),
    ].join("\n");
  }

  if (trimmed === "/transport mismatches") {
    if (!context.gateway) {
      return "Gateway runtime is not attached to this execution context.";
    }
    const overview = await context.gateway.transportOverview();
    const mismatches = overview.details.filter(
      (entry) => entry.mismatchFlags.length > 0,
    );
    return [
      `transport mismatch summary: mismatches=${overview.mismatchCount} operational=${overview.operationalCount}/${overview.details.length}`,
      ...(mismatches.length
        ? mismatches.map(
            (entry) =>
              `- ${entry.platform} :: ${entry.mismatchFlags.join(", ")} :: ${entry.inventory?.detail ?? entry.platformState?.detail ?? "n/a"}`,
          )
        : ["- none"]),
    ].join("\n");
  }

  if (
    trimmed.startsWith("/transport show ") ||
    trimmed.startsWith("/gateway transport show ") ||
    trimmed.startsWith("/transport ") ||
    trimmed.startsWith("/gateway transport ")
  ) {
    const rawPlatform = trimmed
      .replace(/^\/gateway\s+transport\s+show\s+/u, "")
      .replace(/^\/transport\s+show\s+/u, "")
      .replace(/^\/gateway\s+transport\s+/u, "")
      .replace(/^\/transport\s+/u, "")
      .trim();
    const platform = parseTransportPlatform(rawPlatform);
    if (!platform) {
      return "Usage: /transport show <platform>";
    }
    return formatTransportDrilldown(
      await buildTransportDrilldown(context as AppContext, platform),
    );
  }

  if (trimmed === "/platforms" || trimmed === "/platforms status") {
    if (!context.gateway) {
      return "Gateway runtime is not attached to this execution context.";
    }
    const state = await context.gateway.state(50);
    const messagingCatalog = groupNativePluginCatalog(
      getNativePluginCatalog(context.config),
    ).messaging;
    const totals = [
      `configured=${state.totals.configuredPlatforms}`,
      `ready=${state.totals.readyAdapters}`,
      `pluginMediated=${state.totals.pluginMediatedAdapters}`,
      `official=${state.totals.officialPluginAdapters}`,
      `vendored=${state.totals.vendoredPluginAdapters}`,
    ].join(" ");
    const controlPlane = getNativeTransportControlPlane(
      context.runtime,
      context.config,
      context.services.gatewayConfig,
    );
    const platformLines = state.platforms.map((entry) => {
      const counters = [
        `send=${entry.sendCount}`,
        `recv=${entry.receiveCount}`,
        `route=${entry.routeCount}`,
        `resp=${entry.respondCount}`,
        `events=${entry.eventCount}`,
      ].join(" ");
      return `- ${entry.platform} [${entry.transportState}] ready=${entry.ready} mode=${entry.mode} presence=${entry.presence.status}${entry.nativePluginId ? ` plugin=${entry.nativePluginId}` : ""}${entry.nativePluginSource ? ` source=${entry.nativePluginSource}` : ""}${entry.lastEventKind ? ` last=${entry.lastEventKind}` : ""} ${counters} :: ${entry.detail}`;
    });
    const pluginLines = messagingCatalog.map(
      (entry) =>
        `- plugin ${entry.id} [${entry.enabled ? "enabled" : "disabled"}] source=${entry.source} :: ${entry.notes}`,
    );
    const inventoryLines = controlPlane.transportInventory.map(
      (entry) =>
        `- inventory ${entry.platform} source=${entry.source} config=${entry.configEnabled} gateway=${entry.gatewayEnabled} op=${entry.operational} reason=${entry.reason}`,
    );
    return [
      `platform totals: ${totals}`,
      ...platformLines,
      ...inventoryLines,
      ...pluginLines,
    ].join("\n");
  }

  if (trimmed === "/gateway state" || trimmed.startsWith("/gateway state ")) {
    if (!context.gateway) {
      return "Gateway runtime is not attached to this execution context.";
    }
    const filters = parseGatewayFiltersFromText(
      trimmed.replace("/gateway state", "").trim(),
    );
    return JSON.stringify(
      await context.gateway.state(filters.limit ?? 20, filters),
      null,
      2,
    );
  }

  if (trimmed === "/gateway runtime") {
    if (!context.gateway) {
      return "Gateway runtime is not attached to this execution context.";
    }
    const state = await context.gateway.state(50);
    const runtimeStatus = context.gateway.runtimeStatus();
    return JSON.stringify(
      {
        runtime: runtimeStatus,
        messagingBridge: runtimeStatus.messagingBridge,
        transportInventory: runtimeStatus.transportInventory,
        transportControl: runtimeStatus.transportControl,
        mediation: {
          pluginMediatedAdapters: state.totals.pluginMediatedAdapters,
          officialPluginAdapters: state.totals.officialPluginAdapters,
          vendoredPluginAdapters: state.totals.vendoredPluginAdapters,
        },
        messagingPlugins: groupNativePluginCatalog(
          getNativePluginCatalog(context.config),
        ).messaging,
      },
      null,
      2,
    );
  }

  if (trimmed === "/gateway daemon") {
    if (!context.gateway) {
      return "Gateway runtime is not attached to this execution context.";
    }
    const runtime = context.gateway.runtimeStatus();
    return JSON.stringify(
      {
        runtime,
        daemon: runtime.daemon,
      },
      null,
      2,
    );
  }

  if (trimmed.startsWith("/gateway watchdog")) {
    if (!context.gateway) {
      return "Gateway runtime is not attached to this execution context.";
    }
    const reason = trimmed.replace("/gateway watchdog", "").trim() || "cli";
    return JSON.stringify(
      {
        reason,
        records: await context.gateway.watchdog(reason),
        runtime: context.gateway.runtimeStatus(),
      },
      null,
      2,
    );
  }

  if (trimmed === "/gateway watch" || trimmed.startsWith("/gateway watch ")) {
    if (!context.gateway) {
      return "Gateway runtime is not attached to this execution context.";
    }
    const payload = trimmed.replace("/gateway watch", "").trim();
    const [candidate, ...reasonParts] = payload.split(/\s+/u);
    const platform =
      candidate === "all" || !candidate
        ? "all"
        : (parseTransportPlatform(candidate) ?? "all");
    const reason = reasonParts.join(" ").trim() || "cli";
    return JSON.stringify(
      {
        platform,
        reason,
        records: await context.gateway.watch(platform, reason),
        runtime: context.gateway.runtimeStatus(),
      },
      null,
      2,
    );
  }

  if (trimmed.startsWith("/gateway restart")) {
    if (!context.gateway) {
      return "Gateway runtime is not attached to this execution context.";
    }
    const payload = trimmed.replace("/gateway restart", "").trim();
    const [candidate, ...reasonParts] = payload.split(/\s+/u);
    const platform =
      candidate === "all" || !candidate
        ? "all"
        : (parseTransportPlatform(candidate) ?? "all");
    const reason = reasonParts.join(" ").trim() || "cli";
    return JSON.stringify(
      {
        platform,
        reason,
        records: await context.gateway.restart(platform, reason),
        runtime: context.gateway.runtimeStatus(),
      },
      null,
      2,
    );
  }

  if (trimmed === "/gateway supervision") {
    if (!context.gateway) {
      return "Gateway runtime is not attached to this execution context.";
    }
    return JSON.stringify(
      {
        runtime: context.gateway.runtimeStatus(),
        records: context.gateway.supervision(50),
      },
      null,
      2,
    );
  }

  if (trimmed.startsWith("/gateway edit ")) {
    if (!context.gateway) {
      return "Gateway runtime is not attached to this execution context.";
    }
    const payload = trimmed.replace("/gateway edit ", "").trim();
    const [left, text] = payload.split("::").map((part) => part.trim());
    if (!left || !text) {
      return "Usage: /gateway edit <delivery-id> :: <text>";
    }
    const updated = await context.gateway.editDelivery(left, text);
    return JSON.stringify(updated, null, 2);
  }

  if (trimmed.startsWith("/gateway progressive ")) {
    if (!context.gateway) {
      return "Gateway runtime is not attached to this execution context.";
    }
    const payload = trimmed.replace("/gateway progressive ", "").trim();
    const [left, right] = payload.split("::").map((part) => part.trim());
    if (!left || !right) {
      return "Usage: /gateway progressive <platform> <room-id> :: <part-one> => <part-two> [=> <part-three>]";
    }
    const [platform, roomId] = left.split(/\s+/u);
    if (!platform || !roomId) {
      return "Usage: /gateway progressive <platform> <room-id> :: <part-one> => <part-two> [=> <part-three>]";
    }
    const parts = right
      .split("=>")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length < 2) {
      return "Progressive delivery requires at least two message parts.";
    }
    const delivery = await context.gateway.sendProgressive(
      {
        platform: platform as PlatformName,
        roomId,
        userId: input.userId,
      },
      parts,
    );
    return JSON.stringify(delivery, null, 2);
  }

  if (trimmed === "/voice" || trimmed === "/voice status") {
    const session = context.services.gatewaySessions.get(sessionKey);
    if (!session) {
      return "No active gateway session is attached to this conversation yet.";
    }
    return JSON.stringify(
      {
        sessionKey: session.sessionKey,
        platform: session.platform,
        roomId: session.roomId,
        voiceMode: session.voiceMode ?? "off",
        voiceChannelId: session.voiceChannelId ?? null,
        voiceChannelState: session.voiceChannelState ?? "disconnected",
        voiceUpdatedAt: session.voiceUpdatedAt ?? null,
        voiceUpdatedReason: session.voiceUpdatedReason ?? null,
        isHome: session.isHome ?? false,
        homeLabel: session.homeLabel ?? null,
        homeUpdatedAt: session.homeUpdatedAt ?? null,
      },
      null,
      2,
    );
  }

  if (trimmed === "/voice on") {
    const session = context.services.gatewaySessions.setVoiceMode(
      sessionKey,
      "voice_only",
    );
    return JSON.stringify(session, null, 2);
  }

  if (trimmed === "/voice off") {
    const session = context.services.gatewaySessions.setVoiceMode(
      sessionKey,
      "off",
    );
    return JSON.stringify(session, null, 2);
  }

  if (trimmed === "/voice tts") {
    const session = context.services.gatewaySessions.setVoiceMode(
      sessionKey,
      "all",
    );
    return JSON.stringify(session, null, 2);
  }

  if (trimmed === "/voice join" || trimmed === "/voice channel") {
    const session = context.services.gatewaySessions.setVoiceChannel(
      sessionKey,
      input.roomId ?? sessionKey,
    );
    return JSON.stringify(session, null, 2);
  }

  if (trimmed === "/voice leave") {
    const session = context.services.gatewaySessions.setVoiceChannel(
      sessionKey,
      undefined,
    );
    return JSON.stringify(session, null, 2);
  }

  if (trimmed === "/sethome") {
    const session = context.services.gatewaySessions.markHome(sessionKey, {
      isHome: true,
      label: input.source ? `${input.source} home` : "home",
    });
    return JSON.stringify(session, null, 2);
  }

  if (trimmed === "/sessions gateway") {
    return JSON.stringify(context.services.gatewaySessions.list(), null, 2);
  }

  if (trimmed.startsWith("/sessions gateway expire ")) {
    const value = Number(
      trimmed.replace("/sessions gateway expire ", "").trim(),
    );
    if (Number.isNaN(value) || value <= 0) {
      return "Usage: /sessions gateway expire <minutes>";
    }
    return JSON.stringify(
      {
        expired: context.services.gatewaySessions.expireOlderThan(value),
      },
      null,
      2,
    );
  }

  if (trimmed === "/gateway trace" || trimmed.startsWith("/gateway trace ")) {
    if (!context.gateway) {
      return "Gateway runtime is not attached to this execution context.";
    }
    const filters = parseGatewayFiltersFromText(
      trimmed.replace("/gateway trace", "").trim(),
    );
    const traces = context.gateway.trace(filters.limit ?? 20, filters);
    return traces.length
      ? traces
          .map(
            (trace) =>
              `- [${trace.kind}] ${trace.platform} ${trace.detail}\n  trace=${trace.traceId} session=${trace.sessionId ?? "n/a"} delivery=${trace.deliveryId ?? "n/a"}${trace.messageId ? ` message=${trace.messageId}` : ""}${trace.threadId ? ` thread=${trace.threadId}` : ""}${trace.replyToMessageId ? ` replyTo=${trace.replyToMessageId}` : ""}`,
          )
          .join("\n\n")
      : "No gateway traces recorded.";
  }

  if (
    trimmed === "/gateway deliveries" ||
    trimmed.startsWith("/gateway deliveries ")
  ) {
    if (!context.gateway) {
      return "Gateway runtime is not attached to this execution context.";
    }
    const filters = parseGatewayFiltersFromText(
      trimmed.replace("/gateway deliveries", "").trim(),
    );
    const history = await context.gateway.history(filters.limit ?? 20, filters);
    const deliveries = history.deliveries;
    return deliveries.length
      ? deliveries
          .map(
            (delivery) =>
              `- ${delivery.id} ${delivery.target.platform} -> ${delivery.target.channelId ?? delivery.target.userId ?? "n/a"} [${delivery.target.mode}]${delivery.threadId ? ` thread=${delivery.threadId}` : ""}${delivery.replyToId ? ` replyTo=${delivery.replyToId}` : ""}\n  ${delivery.text.slice(0, 180)}${delivery.metadata && Object.keys(delivery.metadata).length ? `\n  metadata=${JSON.stringify(delivery.metadata)}` : ""}`,
          )
          .join("\n\n")
      : "No delivery records found.";
  }

  if (
    trimmed === "/gateway history" ||
    trimmed.startsWith("/gateway history ")
  ) {
    if (!context.gateway) {
      return "Gateway runtime is not attached to this execution context.";
    }
    const filters = parseGatewayFiltersFromText(
      trimmed.replace("/gateway history", "").trim(),
    );
    const history = await context.gateway.history(filters.limit ?? 20, filters);
    return JSON.stringify(history, null, 2);
  }

  if (trimmed === "/model" || trimmed === "/model status") {
    return JSON.stringify(context.services.settings.get().model, null, 2);
  }

  if (trimmed === "/execution" || trimmed === "/execution status") {
    const settings = context.services.settings.get().execution;
    const native = await getEffectiveShellStatus(
      context.runtime,
      context.services,
    );
    const health = await context.services.terminal.health();
    return JSON.stringify(
      {
        active: settings,
        native,
        backends: health,
      },
      null,
      2,
    );
  }

  if (trimmed === "/runtime plugins" || trimmed === "/plugins native") {
    const catalog = getNativePluginCatalog(context.config);
    const ownership =
      context.services.nativeOwnership.controlPlane() ??
      getNativeOwnershipControlPlane(
        context.runtime,
        context.services,
        context.config,
        context.services.gatewayConfig,
      );
    return JSON.stringify(
      {
        catalog,
        grouped: groupNativePluginCatalog(catalog),
        serviceRegistry: context.services.nativeRegistry,
        pluginManager: ownership.pluginManager,
        ownership: {
          serviceResolution: ownership.serviceResolution,
          identity: ownership.identity,
        },
      },
      null,
      2,
    );
  }

  if (trimmed === "/runtime services" || trimmed === "/services native") {
    const ownership =
      context.services.nativeOwnership.controlPlane() ??
      getNativeOwnershipControlPlane(
        context.runtime,
        context.services,
        context.config,
        context.services.gatewayConfig,
      );
    const integration = await getNativeIntegrationControlPlane(
      context.runtime,
      {
        web: context.services.web,
        mcp: context.services.mcp,
      },
    );
    return JSON.stringify(
      {
        resolution: ownership.serviceResolution,
        integration,
        messaging: ownership.transportControl.messagingBridge,
        transportInventory: ownership.transportControl.transportInventory,
        transportControl: ownership.transportControl.totals,
        ownership: {
          pluginManager: ownership.pluginManager,
          identity: ownership.identity,
        },
        registry: context.services.nativeRegistry,
      },
      null,
      2,
    );
  }

  if (trimmed === "/runtime ownership") {
    return JSON.stringify(
      (await context.services.nativeOwnership.snapshot()) ??
        (await getNativeOwnershipSnapshot(
          context.runtime,
          context.services,
          context.config,
          context.services.gatewayConfig,
        )),
      null,
      2,
    );
  }

  if (trimmed === "/runtime transports") {
    return JSON.stringify(
      getNativeTransportControlPlane(
        context.runtime,
        context.config,
        context.services.gatewayConfig,
      ),
      null,
      2,
    );
  }

  if (
    trimmed === "/accounts" ||
    trimmed === "/runtime accounts" ||
    trimmed === "/accounts status"
  ) {
    return JSON.stringify(
      {
        activeProvider: context.services.settings.get().model.provider,
        accounts: getLinkedProviderAccountsSnapshot(),
        connect: {
          codex: getLinkedProviderConnectAdvice("codex"),
          claudeCode: getLinkedProviderConnectAdvice("claude-code"),
        },
      },
      null,
      2,
    );
  }

  if (trimmed === "/accounts doctor") {
    const accounts = getLinkedProviderAccountsSnapshot();
    const codexAdvice = getLinkedProviderConnectAdvice("codex");
    const claudeAdvice = getLinkedProviderConnectAdvice("claude-code");
    return [
      `codex: nativeReady=${accounts.codex.nativeReady ? "yes" : "no"} fallbackReady=${accounts.codex.fallbackReady ? "yes" : "no"} available=${accounts.codex.available ? "yes" : "no"}`,
      `  detail: ${accounts.codex.detail}`,
      `  next: ${codexAdvice.preferredAction}${codexAdvice.primaryCommand ? ` -> ${codexAdvice.primaryCommand}` : ""}`,
      `claude-code: nativeReady=${accounts.claudeCode.nativeReady ? "yes" : "no"} fallbackReady=${accounts.claudeCode.fallbackReady ? "yes" : "no"} available=${accounts.claudeCode.available ? "yes" : "no"}`,
      `  detail: ${accounts.claudeCode.detail}`,
      `  next: ${claudeAdvice.preferredAction}${claudeAdvice.primaryCommand ? ` -> ${claudeAdvice.primaryCommand}` : ""}`,
    ].join("\n");
  }

  if (trimmed === "/accounts refresh") {
    return JSON.stringify(await refreshLinkedAccounts("all"), null, 2);
  }

  if (trimmed.startsWith("/accounts refresh ")) {
    const provider = resolveLinkedProviderName(
      trimmed.replace("/accounts refresh ", "").trim(),
    );
    if (!provider) {
      return "Usage: /accounts refresh <codex|claude-code>";
    }
    return JSON.stringify(await refreshLinkedAccounts(provider), null, 2);
  }

  if (trimmed.startsWith("/accounts use ")) {
    const provider = resolveLinkedProviderName(
      trimmed.replace("/accounts use ", "").trim(),
    );
    if (!provider) {
      return "Usage: /accounts use <codex|claude-code>";
    }
    return JSON.stringify(activateLinkedProvider(context, provider), null, 2);
  }

  if (trimmed.startsWith("/accounts connect ")) {
    const provider = resolveLinkedProviderName(
      trimmed.replace("/accounts connect ", "").trim(),
    );
    if (!provider) {
      return "Usage: /accounts connect <codex|claude-code>";
    }
    return JSON.stringify(
      await connectLinkedProvider(context, provider),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/accounts login ")) {
    const provider = resolveLinkedProviderName(
      trimmed.replace("/accounts login ", "").trim(),
    );
    if (!provider) {
      return "Usage: /accounts login <codex|claude-code>";
    }
    return JSON.stringify(
      {
        provider,
        command: getLinkedProviderLoginCommand(provider),
        setupCommand: getLinkedProviderSetupCommand(provider),
        advice: getLinkedProviderConnectAdvice(provider),
        status: getLinkedProviderAccountsSnapshot(),
      },
      null,
      2,
    );
  }

  if (trimmed.startsWith("/accounts setup-token ")) {
    const provider = resolveLinkedProviderName(
      trimmed.replace("/accounts setup-token ", "").trim(),
    );
    if (provider !== "claude-code") {
      return "Usage: /accounts setup-token claude-code";
    }
    return JSON.stringify(
      {
        provider,
        command: getLinkedProviderSetupCommand(provider),
        advice: getLinkedProviderConnectAdvice(provider),
        status: getLinkedProviderAccountsSnapshot(),
      },
      null,
      2,
    );
  }

  if (
    trimmed === "/runtime ecosystem" ||
    trimmed === "/plugins ecosystem" ||
    trimmed === "/runtime ecosystem refresh"
  ) {
    const refresh = trimmed.endsWith(" refresh");
    return JSON.stringify(
      await getNativeEcosystemSnapshot(
        context.runtime,
        context.services,
        context.config,
        context.services.gatewayConfig,
        refresh,
      ),
      null,
      2,
    );
  }

  if (trimmed === "/ecosystem" || trimmed === "/ecosystem packages") {
    return JSON.stringify(
      await getNativeEcosystemSnapshot(
        context.runtime,
        context.services,
        context.config,
        context.services.gatewayConfig,
      ),
      null,
      2,
    );
  }

  if (trimmed === "/benchmarks packs") {
    return JSON.stringify(
      {
        packs: context.services.ecosystem.benchmarkPacks(),
      },
      null,
      2,
    );
  }

  if (trimmed === "/skills channels") {
    return JSON.stringify(
      {
        channels: context.services.ecosystem.distributionChannels(),
      },
      null,
      2,
    );
  }

  if (trimmed === "/skills optional" || trimmed === "/skills optional packs") {
    return JSON.stringify(
      {
        optionalSkillPacks: context.services.ecosystem.optionalSkillPacks(),
      },
      null,
      2,
    );
  }

  if (trimmed === "/modeling profiles") {
    return JSON.stringify(
      {
        profiles: context.services.ecosystem.modelingProfiles(),
      },
      null,
      2,
    );
  }

  if (trimmed === "/insights") {
    return JSON.stringify(
      {
        ownership:
          context.services.nativeOwnership.controlPlane() ??
          getNativeOwnershipControlPlane(
            context.runtime,
            context.services,
            context.config,
            context.services.gatewayConfig,
          ),
        ecosystem: await getNativeEcosystemSnapshot(
          context.runtime,
          context.services,
          context.config,
          context.services.gatewayConfig,
        ),
        operator: await context.services.operator.setupSummary(),
      },
      null,
      2,
    );
  }

  if (trimmed === "/runtime autonomous") {
    return JSON.stringify(
      getAutonomousControlPlane(
        context.runtime,
        context.services,
        context.config,
      ),
      null,
      2,
    );
  }

  if (trimmed === "/runtime media") {
    return JSON.stringify(getNativeMediaControlPlane(context.config), null, 2);
  }

  if (trimmed === "/runtime forms") {
    return JSON.stringify(getNativeFormsControlPlane(context.runtime), null, 2);
  }

  if (trimmed === "/runtime planning") {
    return JSON.stringify(
      getNativePlanningControlPlane(context.runtime),
      null,
      2,
    );
  }

  if (trimmed === "/forms" || trimmed === "/forms list") {
    return JSON.stringify(
      {
        control: getNativeFormsControlPlane(context.runtime),
        forms: await listEffectiveForms(context.runtime),
      },
      null,
      2,
    );
  }

  if (trimmed === "/forms templates") {
    return JSON.stringify(
      {
        control: getNativeFormsControlPlane(context.runtime),
        templates: getEffectiveFormTemplates(context.runtime),
      },
      null,
      2,
    );
  }

  if (trimmed.startsWith("/forms show ")) {
    const formId = trimmed.replace("/forms show ", "").trim();
    if (!formId) {
      return "Usage: /forms show <form-id>";
    }
    return JSON.stringify(
      {
        form: await getEffectiveForm(context.runtime, formId),
      },
      null,
      2,
    );
  }

  if (trimmed.startsWith("/forms create ")) {
    const payload = trimmed.replace("/forms create ", "").trim();
    if (!payload) {
      return "Usage: /forms create <template-id> [:: <json-metadata>]";
    }
    const [templateId, metadataRaw] = payload
      .split("::")
      .map((part) => part.trim());
    let metadata: unknown;
    if (metadataRaw) {
      try {
        metadata = JSON.parse(metadataRaw);
      } catch {
        return "Usage: /forms create <template-id> [:: <json-metadata>]";
      }
    }
    return JSON.stringify(
      {
        form: await createEffectiveForm(context.runtime, templateId, metadata),
      },
      null,
      2,
    );
  }

  if (trimmed.startsWith("/forms cancel ")) {
    const formId = trimmed.replace("/forms cancel ", "").trim();
    if (!formId) {
      return "Usage: /forms cancel <form-id>";
    }
    return JSON.stringify(
      {
        cancelled: await cancelEffectiveForm(context.runtime, formId),
      },
      null,
      2,
    );
  }

  if (trimmed === "/plans" || trimmed === "/plans list") {
    return JSON.stringify(
      {
        control: getNativePlanningControlPlane(context.runtime),
        plans: await listEffectivePlans(context.runtime),
      },
      null,
      2,
    );
  }

  if (trimmed.startsWith("/plans show ")) {
    const planId = trimmed.replace("/plans show ", "").trim();
    if (!planId) {
      return "Usage: /plans show <plan-id>";
    }
    return JSON.stringify(
      {
        plan: await getEffectivePlan(context.runtime, planId),
      },
      null,
      2,
    );
  }

  if (trimmed.startsWith("/plans create ")) {
    const payload = trimmed.replace("/plans create ", "").trim();
    if (!payload) {
      return "Usage: /plans create <title> :: <objective> [:: <json-metadata>]";
    }
    const [titlePart, objectivePart, metadataRaw] = payload
      .split("::")
      .map((part) => part.trim());
    if (!titlePart || !objectivePart) {
      return "Usage: /plans create <title> :: <objective> [:: <json-metadata>]";
    }
    let metadata: unknown;
    if (metadataRaw) {
      try {
        metadata = JSON.parse(metadataRaw);
      } catch {
        return "Usage: /plans create <title> :: <objective> [:: <json-metadata>]";
      }
    }
    return JSON.stringify(
      {
        plan: await createEffectivePlan(context.runtime, {
          title: titlePart,
          objective: objectivePart,
          metadata,
        }),
      },
      null,
      2,
    );
  }

  if (trimmed === "/runtime e2b" || trimmed === "/runtime sandboxes") {
    return JSON.stringify(
      getNativeExecutionControlPlane(context.runtime).e2b,
      null,
      2,
    );
  }

  if (trimmed === "/e2b" || trimmed === "/e2b list") {
    return JSON.stringify(
      {
        control: getNativeExecutionControlPlane(context.runtime).e2b,
        sandboxes: listEffectiveSandboxes(context.runtime),
      },
      null,
      2,
    );
  }

  if (trimmed.startsWith("/e2b create")) {
    const template = trimmed.replace("/e2b create", "").trim() || undefined;
    return JSON.stringify(
      {
        sandboxId: await createEffectiveSandbox(context.runtime, {
          template,
        }),
        sandboxes: listEffectiveSandboxes(context.runtime),
      },
      null,
      2,
    );
  }

  if (trimmed.startsWith("/e2b kill")) {
    const sandboxId = trimmed.replace("/e2b kill", "").trim() || undefined;
    await killEffectiveSandbox(context.runtime, sandboxId);
    return JSON.stringify(
      {
        killed: sandboxId ?? "active",
        sandboxes: listEffectiveSandboxes(context.runtime),
      },
      null,
      2,
    );
  }

  if (trimmed.startsWith("/e2b exec ")) {
    const payload = trimmed.replace("/e2b exec ", "").trim();
    const [languagePart, codePart] = payload
      .split("::")
      .map((part) => part.trim());
    if (!languagePart || !codePart) {
      return "Usage: /e2b exec <python|javascript|typescript|bash> :: <code>";
    }
    return JSON.stringify(
      {
        result: await executeEffectiveSandboxCode(
          context.runtime,
          codePart,
          languagePart,
        ),
      },
      null,
      2,
    );
  }

  if (trimmed === "/runtime codegen") {
    return JSON.stringify(
      getNativeExecutionControlPlane(context.runtime),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/codegen generate ")) {
    const payload = trimmed.replace("/codegen generate ", "").trim();
    const [namePart, promptPart] = payload
      .split("::")
      .map((part) => part.trim());
    if (!namePart || !promptPart) {
      return "Usage: /codegen generate <project-name> :: <prompt>";
    }
    const request = {
      projectName: namePart,
      prompt: promptPart,
      objective: promptPart,
    };
    const workflow = createAutocoderWorkflow(context, {
      title: `Generate ${namePart}`,
      objective: promptPart,
      kind: "generate",
      projectName: namePart,
    });
    try {
      const generation = await generateEffectiveCode(context.runtime, request);
      const run = context.services.autocoderPipeline.record({
        workflowId: workflow.workflowId,
        kind: "generate",
        projectName: namePart,
        sessionId: workflow.sessionId,
        taskId: workflow.taskId,
        request,
        result: generation,
      });
      completeAutocoderWorkflow(
        context,
        workflow.taskId,
        workflow.workflowId,
        "system: code generation completed",
      );
      return JSON.stringify(
        {
          workflowId: workflow.workflowId,
          taskId: workflow.taskId,
          run,
          generation,
        },
        null,
        2,
      );
    } catch (error) {
      failAutocoderWorkflow(
        context,
        workflow.taskId,
        workflow.workflowId,
        error,
      );
      throw error;
    }
  }

  if (trimmed.startsWith("/codegen research ")) {
    const payload = trimmed.replace("/codegen research ", "").trim();
    const [left, description] = payload.split("::").map((part) => part.trim());
    if (!left || !description) {
      return "Usage: /codegen research <project-name> | type:plugin | apis:api1,api2 | requirements:req1,req2 :: <description>";
    }
    const segments = left.split("|").map((part) => part.trim());
    const projectName = segments.shift()?.trim();
    if (!projectName) {
      return "Usage: /codegen research <project-name> | type:plugin | apis:api1,api2 | requirements:req1,req2 :: <description>";
    }
    const type = segments
      .find((part) => part.startsWith("type:"))
      ?.replace("type:", "")
      .trim();
    const apis =
      segments
        .find((part) => part.startsWith("apis:"))
        ?.replace("apis:", "")
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean) ?? [];
    const requirements =
      segments
        .find((part) => part.startsWith("requirements:"))
        ?.replace("requirements:", "")
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean) ?? [];
    const request = {
      projectName,
      targetType: type ?? "plugin",
      description,
      apis,
      requirements,
    };
    const workflow = createAutocoderWorkflow(context, {
      title: `Research ${projectName}`,
      objective: description,
      kind: "research",
      projectName,
    });
    try {
      const research = await performEffectiveCodeResearch(
        context.runtime,
        request,
      );
      const run = context.services.autocoderPipeline.record({
        workflowId: workflow.workflowId,
        kind: "research",
        projectName,
        sessionId: workflow.sessionId,
        taskId: workflow.taskId,
        request,
        result: research,
      });
      completeAutocoderWorkflow(
        context,
        workflow.taskId,
        workflow.workflowId,
        "system: research completed",
      );
      return JSON.stringify(
        {
          workflowId: workflow.workflowId,
          taskId: workflow.taskId,
          run,
          research,
        },
        null,
        2,
      );
    } catch (error) {
      failAutocoderWorkflow(
        context,
        workflow.taskId,
        workflow.workflowId,
        error,
      );
      throw error;
    }
  }

  if (trimmed.startsWith("/codegen prd ")) {
    const payload = trimmed.replace("/codegen prd ", "").trim();
    const [left, description] = payload.split("::").map((part) => part.trim());
    if (!left || !description) {
      return "Usage: /codegen prd <project-name> | type:plugin | apis:api1,api2 | requirements:req1,req2 :: <description>";
    }
    const segments = left.split("|").map((part) => part.trim());
    const projectName = segments.shift()?.trim();
    if (!projectName) {
      return "Usage: /codegen prd <project-name> | type:plugin | apis:api1,api2 | requirements:req1,req2 :: <description>";
    }
    const targetType =
      segments
        .find((part) => part.startsWith("type:"))
        ?.replace("type:", "")
        .trim() ?? "plugin";
    const apis =
      segments
        .find((part) => part.startsWith("apis:"))
        ?.replace("apis:", "")
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean) ?? [];
    const requirements =
      segments
        .find((part) => part.startsWith("requirements:"))
        ?.replace("requirements:", "")
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean) ?? [];
    const request = {
      projectName,
      targetType,
      description,
      apis,
      requirements,
    };
    const workflow = createAutocoderWorkflow(context, {
      title: `PRD ${projectName}`,
      objective: description,
      kind: "prd",
      projectName,
    });
    try {
      const research = await performEffectiveCodeResearch(
        context.runtime,
        request,
      );
      const researchRun = context.services.autocoderPipeline.record({
        workflowId: workflow.workflowId,
        kind: "research",
        projectName,
        sessionId: workflow.sessionId,
        taskId: workflow.taskId,
        request,
        result: research,
      });
      const prd = await generateEffectivePrd(
        context.runtime,
        request,
        research as Record<string, unknown>,
      );
      const prdRun = context.services.autocoderPipeline.record({
        workflowId: workflow.workflowId,
        kind: "prd",
        projectName,
        sessionId: workflow.sessionId,
        taskId: workflow.taskId,
        request,
        result: prd,
        linkedRunIds: [researchRun.id],
        parentRunId: researchRun.id,
      });
      completeAutocoderWorkflow(
        context,
        workflow.taskId,
        workflow.workflowId,
        "system: PRD workflow completed",
      );
      return JSON.stringify(
        {
          workflowId: workflow.workflowId,
          taskId: workflow.taskId,
          researchRun,
          prdRun,
          research,
          prd,
        },
        null,
        2,
      );
    } catch (error) {
      failAutocoderWorkflow(
        context,
        workflow.taskId,
        workflow.workflowId,
        error,
      );
      throw error;
    }
  }

  if (trimmed.startsWith("/codegen qa ")) {
    const projectPath = trimmed.replace("/codegen qa ", "").trim();
    if (!projectPath) {
      return "Usage: /codegen qa <project-path>";
    }
    const projectName = projectPath.split("/").filter(Boolean).at(-1);
    const workflow = createAutocoderWorkflow(context, {
      title: `QA ${projectName ?? "project"}`,
      objective: `QA ${projectPath}`,
      kind: "qa",
      projectName,
    });
    try {
      const qa = await performEffectiveCodeQa(context.runtime, projectPath);
      const run = context.services.autocoderPipeline.record({
        workflowId: workflow.workflowId,
        kind: "qa",
        projectName,
        sessionId: workflow.sessionId,
        taskId: workflow.taskId,
        request: { projectPath },
        result: qa,
      });
      completeAutocoderWorkflow(
        context,
        workflow.taskId,
        workflow.workflowId,
        "system: QA completed",
      );
      return JSON.stringify(
        { workflowId: workflow.workflowId, taskId: workflow.taskId, run, qa },
        null,
        2,
      );
    } catch (error) {
      failAutocoderWorkflow(
        context,
        workflow.taskId,
        workflow.workflowId,
        error,
      );
      throw error;
    }
  }

  if (trimmed.startsWith("/github create ")) {
    const payload = trimmed.replace("/github create ", "").trim();
    if (!payload) {
      return "Usage: /github create <repo-name> [| private:false]";
    }
    const [name, ...flags] = payload.split("|").map((part) => part.trim());
    const privateFlag = flags.find((part) => part.startsWith("private:"));
    const isPrivate = privateFlag
      ? privateFlag.replace("private:", "").trim() !== "false"
      : true;
    const workflow = createAutocoderWorkflow(context, {
      title: `Create repo ${name}`,
      objective: `Create GitHub repository ${name}`,
      kind: "github.create",
      repositoryName: name,
    });
    try {
      const repository = await createEffectiveRepository(
        context.runtime,
        name,
        isPrivate,
      );
      const run = context.services.autocoderPipeline.record({
        workflowId: workflow.workflowId,
        kind: "github.create",
        repositoryName: name,
        sessionId: workflow.sessionId,
        taskId: workflow.taskId,
        request: { name, private: isPrivate },
        result: repository,
      });
      completeAutocoderWorkflow(
        context,
        workflow.taskId,
        workflow.workflowId,
        "system: repository created",
      );
      return JSON.stringify(
        {
          workflowId: workflow.workflowId,
          taskId: workflow.taskId,
          run,
          repository,
        },
        null,
        2,
      );
    } catch (error) {
      failAutocoderWorkflow(
        context,
        workflow.taskId,
        workflow.workflowId,
        error,
      );
      throw error;
    }
  }

  if (trimmed.startsWith("/github delete ")) {
    const name = trimmed.replace("/github delete ", "").trim();
    if (!name) {
      return "Usage: /github delete <repo-name>";
    }
    const workflow = createAutocoderWorkflow(context, {
      title: `Delete repo ${name}`,
      objective: `Delete GitHub repository ${name}`,
      kind: "github.delete",
      repositoryName: name,
    });
    try {
      const deleted = await deleteEffectiveRepository(context.runtime, name);
      const run = context.services.autocoderPipeline.record({
        workflowId: workflow.workflowId,
        kind: "github.delete",
        repositoryName: name,
        sessionId: workflow.sessionId,
        taskId: workflow.taskId,
        request: { name },
        result: deleted,
      });
      completeAutocoderWorkflow(
        context,
        workflow.taskId,
        workflow.workflowId,
        "system: repository deleted",
      );
      return JSON.stringify(
        {
          workflowId: workflow.workflowId,
          taskId: workflow.taskId,
          run,
          deleted,
        },
        null,
        2,
      );
    } catch (error) {
      failAutocoderWorkflow(
        context,
        workflow.taskId,
        workflow.workflowId,
        error,
      );
      throw error;
    }
  }

  if (trimmed === "/secrets list") {
    return JSON.stringify(
      {
        keys: await listEffectiveSecretKeys(context.runtime),
      },
      null,
      2,
    );
  }

  if (trimmed.startsWith("/secrets get ")) {
    const key = trimmed.replace("/secrets get ", "").trim();
    if (!key) {
      return "Usage: /secrets get <key>";
    }
    return JSON.stringify(
      {
        key,
        value: await getEffectiveSecret(context.runtime, key),
      },
      null,
      2,
    );
  }

  if (trimmed.startsWith("/secrets set ")) {
    const payload = trimmed.replace("/secrets set ", "").trim();
    const [key, value] = payload.split("::").map((part) => part.trim());
    if (!key || !value) {
      return "Usage: /secrets set <key> :: <value>";
    }
    const workflow = createAutocoderWorkflow(context, {
      title: `Set secret ${key}`,
      objective: `Set secret ${key}`,
      kind: "secret.set",
    });
    try {
      await setEffectiveSecret(context.runtime, key, value);
      const run = context.services.autocoderPipeline.record({
        workflowId: workflow.workflowId,
        kind: "secret.set",
        sessionId: workflow.sessionId,
        taskId: workflow.taskId,
        request: { key, redacted: true },
        result: { key, valueSet: true },
      });
      completeAutocoderWorkflow(
        context,
        workflow.taskId,
        workflow.workflowId,
        "system: secret stored",
      );
      return JSON.stringify(
        {
          workflowId: workflow.workflowId,
          taskId: workflow.taskId,
          run,
          key,
          valueSet: true,
        },
        null,
        2,
      );
    } catch (error) {
      failAutocoderWorkflow(
        context,
        workflow.taskId,
        workflow.workflowId,
        error,
      );
      throw error;
    }
  }

  if (trimmed === "/codegen runs") {
    return JSON.stringify(
      {
        summary: context.services.autocoderPipeline.summary(),
        runs: context.services.autocoderPipeline.list(20),
      },
      null,
      2,
    );
  }

  if (trimmed === "/codegen workflows") {
    return JSON.stringify(
      {
        summary: context.services.autocoderPipeline.summary(),
        workflows: context.services.autocoderPipeline.listWorkflows(20),
      },
      null,
      2,
    );
  }

  if (trimmed.startsWith("/codegen show ")) {
    const id = trimmed.replace("/codegen show ", "").trim();
    if (!id) {
      return "Usage: /codegen show <run-id>";
    }
    return JSON.stringify(
      {
        run: context.services.autocoderPipeline.get(id),
      },
      null,
      2,
    );
  }

  if (trimmed.startsWith("/codegen workflow ")) {
    const id = trimmed.replace("/codegen workflow ", "").trim();
    if (!id) {
      return "Usage: /codegen workflow <workflow-id>";
    }
    return JSON.stringify(
      context.services.autocoderPipeline.workflow(id),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/codegen bundle ")) {
    const id = trimmed.replace("/codegen bundle ", "").trim();
    if (!id) {
      return "Usage: /codegen bundle <workflow-id>";
    }
    return JSON.stringify(
      context.services.autocoderPipeline.bundleWorkflow(id),
      null,
      2,
    );
  }

  if (trimmed === "/runtime research") {
    return JSON.stringify(
      getNativeResearchControlPlane(context.runtime),
      null,
      2,
    );
  }

  if (trimmed === "/runtime compatibility") {
    return JSON.stringify(
      await context.services.agentSdk.compatibility(),
      null,
      2,
    );
  }

  if (trimmed === "/runtime registry") {
    return JSON.stringify(await context.services.agentSdk.registry(), null, 2);
  }

  if (trimmed === "/runtime registry refresh") {
    return JSON.stringify(
      await context.services.agentSdk.registry(true),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/runtime registry search ")) {
    const query = trimmed.replace("/runtime registry search ", "").trim();
    if (!query) {
      return "Usage: /runtime registry search <query>";
    }
    return JSON.stringify(
      await context.services.agentSdk.searchRegistry(query),
      null,
      2,
    );
  }

  if (trimmed === "/execution backends") {
    const health = await context.services.terminal.health();
    return health
      .map((entry) => {
        const passCount = entry.checks.filter(
          (check) => check.status === "pass",
        ).length;
        const warnCount = entry.checks.filter(
          (check) => check.status === "warn",
        ).length;
        const failCount = entry.checks.filter(
          (check) => check.status === "fail",
        ).length;
        return `- ${entry.backend} [${entry.mode}] ready=${entry.ready} engine=${entry.engine ?? "n/a"} commandTimeout=${entry.limits.commandTimeoutMs}ms healthTimeout=${entry.limits.healthTimeoutMs}ms checks=${passCount}/${entry.checks.length} pass ${warnCount} warn ${failCount} fail bootstrap=${entry.bootstrap.length} :: ${entry.detail}`;
      })
      .join("\n");
  }

  if (trimmed === "/execution bootstrap") {
    const health = await context.services.terminal.health();
    return health
      .map(
        (entry) =>
          `- ${entry.backend}\n  checks:\n${entry.checks.map((check) => `    - [${check.status}] ${check.summary}: ${check.detail}`).join("\n")}\n  bootstrap:\n${entry.bootstrap.map((item) => `    - ${item}`).join("\n")}`,
      )
      .join("\n\n");
  }

  if (trimmed.startsWith("/execution preview ")) {
    const command = trimmed.replace("/execution preview ", "").trim();
    if (!command) {
      return "Usage: /execution preview <command>";
    }
    return JSON.stringify(context.services.terminal.preview(command), null, 2);
  }

  if (trimmed.startsWith("/execution set ")) {
    const payload = trimmed.replace("/execution set ", "").trim();
    const [field, ...valueParts] = payload.split(" ");
    const valueRaw = valueParts.join(" ").trim();
    if (!field || !valueRaw) {
      return "Usage: /execution set <field> <value>";
    }
    const path = field.startsWith("execution.") ? field : `execution.${field}`;
    const settings = context.services.settings.set(path, valueRaw);
    return JSON.stringify(settings.execution, null, 2);
  }

  if (trimmed.startsWith("/model set ")) {
    const payload = trimmed.replace("/model set ", "").trim();
    const [field, ...valueParts] = payload.split(" ");
    const valueRaw = valueParts.join(" ").trim();
    if (!field || !valueRaw) {
      return "Usage: /model set <field> <value>";
    }
    const path = field.startsWith("model.") ? field : `model.${field}`;
    const value =
      valueRaw === "true"
        ? true
        : valueRaw === "false"
          ? false
          : Number.isNaN(Number(valueRaw))
            ? valueRaw
            : Number(valueRaw);
    const settings = context.services.settings.set(path, value);
    syncProviderSettings(context, settings);
    return JSON.stringify(settings.model, null, 2);
  }

  if (trimmed === "/config" || trimmed === "/config show") {
    return JSON.stringify(context.services.settings.get(), null, 2);
  }

  if (trimmed === "/theme" || trimmed === "/theme show") {
    const settings = context.services.settings.get();
    const active = getTuiTheme(settings.ui.theme);
    return [
      `active=${active.name}`,
      `label=${active.label}`,
      `primary=${active.primary}`,
      `secondary=${active.secondary}`,
      `available=${listTuiThemes()
        .map((entry) => entry.name)
        .join(", ")}`,
    ].join("\n");
  }

  if (trimmed === "/theme list") {
    return listTuiThemes()
      .map(
        (entry) =>
          `- ${entry.name} :: ${entry.label} aliases=${entry.aliases.join(",") || "none"} primary=${entry.primary} secondary=${entry.secondary}${entry.name === DEFAULT_TUI_THEME ? " default" : ""}`,
      )
      .join("\n");
  }

  if (trimmed === "/theme next") {
    const next = nextTuiTheme(context.services.settings.get().ui.theme);
    const settings = context.services.settings.set("ui.theme", next);
    return JSON.stringify(
      {
        theme: settings.ui.theme,
        profile: getTuiTheme(settings.ui.theme),
      },
      null,
      2,
    );
  }

  if (trimmed === "/theme prev" || trimmed === "/theme previous") {
    const previous = previousTuiTheme(context.services.settings.get().ui.theme);
    const settings = context.services.settings.set("ui.theme", previous);
    return JSON.stringify(
      {
        theme: settings.ui.theme,
        profile: getTuiTheme(settings.ui.theme),
      },
      null,
      2,
    );
  }

  if (trimmed.startsWith("/theme set ")) {
    const rawTheme = trimmed.replace("/theme set ", "").trim();
    const theme = resolveTuiThemeName(rawTheme);
    if (!theme) {
      return [
        `Unknown theme: ${rawTheme}`,
        `Available: ${listTuiThemes()
          .map((entry) => entry.name)
          .join(", ")}`,
      ].join("\n");
    }
    const settings = context.services.settings.set("ui.theme", theme);
    return JSON.stringify(
      {
        theme: settings.ui.theme,
        profile: getTuiTheme(settings.ui.theme),
      },
      null,
      2,
    );
  }

  if (trimmed === "/doctor") {
    const transportOverview = context.gateway
      ? await context.gateway.transportOverview()
      : undefined;
    const checks = await context.services.diagnostics.run({
      skillsCount: context.services.skills.list().length,
      contextFilesCount: context.services.contextFiles.list().length,
      recentCronRuns: context.services.cron.recentRuns(5).length,
      recentTerminalCommands: context.services.terminal.recent(5).length,
      repositoryAvailable: context.services.repository.isRepository(),
      gatewayTransportOverview: transportOverview,
    });
    return checks
      .map(
        (check) =>
          `[${check.status.toUpperCase()}] ${check.summary}: ${check.detail}`,
      )
      .join("\n");
  }

  if (trimmed === "/setup" || trimmed === "/setup checklist") {
    const checklist = await context.services.diagnostics.setupChecklist();
    return checklist.map((item, index) => `${index + 1}. ${item}`).join("\n");
  }

  if (trimmed === "/setup summary") {
    return JSON.stringify(
      await context.services.operator.setupSummary(),
      null,
      2,
    );
  }

  if (trimmed === "/update" || trimmed === "/update preview") {
    return JSON.stringify(
      await context.services.operator.updatePreview(),
      null,
      2,
    );
  }

  if (
    trimmed === "/migrate" ||
    trimmed === "/migrate scan" ||
    trimmed === "/migration scan"
  ) {
    return JSON.stringify(
      context.services.operator.migrationSources(),
      null,
      2,
    );
  }

  if (trimmed === "/migrate history" || trimmed === "/migration history") {
    return JSON.stringify(
      context.services.operator.migrationHistory(20),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/migrate inspect ")) {
    const sourcePath = trimmed.replace("/migrate inspect ", "").trim();
    if (!sourcePath) {
      return "Usage: /migrate inspect <path>";
    }
    return JSON.stringify(
      context.services.operator.inspectMigrationSource(sourcePath),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/migrate apply ")) {
    const payload = trimmed.replace("/migrate apply ", "");
    const [sourcePath, rawFlag] = payload
      .split("::")
      .map((part) => part.trim());
    if (!sourcePath) {
      return "Usage: /migrate apply <path> :: overwrite=true";
    }
    return JSON.stringify(
      context.services.operator.applyMigration(sourcePath, {
        overwrite: rawFlag === "overwrite=true",
      }),
      null,
      2,
    );
  }

  if (trimmed === "/terminal" || trimmed === "/terminal recent") {
    const commands = getEffectiveShellHistory(
      context.runtime,
      context.services,
      10,
    ) as Array<{
      exitCode: number;
      command: string;
      backend?: string;
      backendMode?: string;
      backendEngine?: string;
      timeoutMs?: number;
      durationMs?: number;
      timedOut?: boolean;
      stdout?: string;
      stderr?: string;
    }>;
    return commands.length
      ? commands
          .map(
            (entry) =>
              `- [${entry.exitCode}] ${entry.command}\n  backend=${entry.backend} mode=${entry.backendMode ?? "n/a"} engine=${entry.backendEngine ?? "n/a"} timeout=${entry.timeoutMs ?? "n/a"}ms duration=${entry.durationMs ?? "n/a"}ms timedOut=${entry.timedOut ? "yes" : "no"}\n  stdout=${entry.stdout?.slice(0, 160) || "(empty)"}\n  stderr=${entry.stderr?.slice(0, 160) || "(empty)"}`,
          )
          .join("\n")
      : "No terminal commands recorded.";
  }

  if (trimmed.startsWith("/terminal run ")) {
    const command = trimmed.replace("/terminal run ", "").trim();
    if (!command) {
      return "Usage: /terminal run <command>";
    }
    const result = (await runEffectiveShellCommand(
      context.runtime,
      context.services,
      command,
    )) as {
      command: string;
      exitCode: number;
      stdout?: string;
      stderr?: string;
    };
    return [
      `Command: ${result.command}`,
      `Exit: ${result.exitCode}`,
      `STDOUT:\n${result.stdout || "(empty)"}`,
      `STDERR:\n${result.stderr || "(empty)"}`,
    ].join("\n");
  }

  if (trimmed === "/repo" || trimmed === "/repo status") {
    return context.services.repository.status();
  }

  if (trimmed === "/repo diff") {
    return context.services.repository.diffStat();
  }

  if (trimmed === "/repo log") {
    return context.services.repository.recentCommits();
  }

  if (trimmed === "/tools" || trimmed === "/tools list") {
    const pluginInventory = getEffectivePluginManagerInventory(context.runtime);
    const toolLines = context.services.tools
      .list()
      .map(
        (tool) =>
          `- ${tool.id} [${tool.enabled ? "enabled" : "disabled"}] ${tool.category}: ${tool.description}`,
      );
    const pluginLines =
      pluginInventory?.plugins.map(
        (plugin) => `- native ${JSON.stringify(plugin)}`,
      ) ?? [];
    return [...toolLines, ...pluginLines].join("\n");
  }

  if (trimmed.startsWith("/tools search ")) {
    const query = trimmed.replace("/tools search ", "").trim();
    if (!query) {
      return "Usage: /tools search <query>";
    }
    const tools = context.services.tools.search(query);
    return tools.length
      ? tools
          .map(
            (tool) =>
              `- ${tool.id} [${tool.enabled ? "enabled" : "disabled"}] ${tool.category}/${tool.transport ?? "service"}: ${tool.description}`,
          )
          .join("\n")
      : `No tools found for query: ${query}`;
  }

  if (trimmed === "/tools summary" || trimmed === "/tools registry") {
    return JSON.stringify(
      {
        ...context.services.tools.summary(),
        nativePluginManager: getEffectivePluginManagerInventory(
          context.runtime,
        ),
      },
      null,
      2,
    );
  }

  if (trimmed === "/tools transports") {
    const summary = context.services.tools.summary();
    return summary.transports.length
      ? summary.transports
          .map(
            (entry) =>
              `- ${entry.transport}: enabled=${entry.enabled}/${entry.total}`,
          )
          .join("\n")
      : "No transport metadata available.";
  }

  if (trimmed.startsWith("/tools show ")) {
    const id = trimmed.replace("/tools show ", "").trim();
    if (!id) {
      return "Usage: /tools show <tool-id>";
    }
    return JSON.stringify(
      context.services.tools.get(id) ?? { error: `Tool not found: ${id}` },
      null,
      2,
    );
  }

  if (trimmed.startsWith("/tools category ")) {
    const category = trimmed.replace("/tools category ", "").trim();
    if (!category) {
      return "Usage: /tools category <category>";
    }
    const tools = context.services.tools.byCategory(category);
    return tools.length
      ? tools
          .map(
            (tool) =>
              `- ${tool.id} [${tool.enabled ? "enabled" : "disabled"}] ${tool.description}`,
          )
          .join("\n")
      : `No tools found for category: ${category}`;
  }

  if (trimmed === "/mcp" || trimmed === "/mcp status") {
    return JSON.stringify(
      getEffectiveMcpStatus(context.runtime, context.services),
      null,
      2,
    );
  }

  if (trimmed === "/mcp tools") {
    return JSON.stringify(
      await discoverEffectiveMcpTools(context.runtime, context.services),
      null,
      2,
    );
  }

  if (trimmed === "/mcp cached") {
    return JSON.stringify(
      getEffectiveCachedMcpTools(context.runtime, context.services),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/mcp cached search ")) {
    const query = trimmed.replace("/mcp cached search ", "").trim();
    if (!query) {
      return "Usage: /mcp cached search <query>";
    }
    return JSON.stringify(
      searchEffectiveCachedMcpTools(context.runtime, context.services, query),
      null,
      2,
    );
  }

  if (trimmed === "/mcp cached describe") {
    return describeEffectiveCachedMcpTools(context.runtime, context.services);
  }

  if (trimmed.startsWith("/mcp cached describe ")) {
    const raw = trimmed.replace("/mcp cached describe ", "").trim();
    const limit = Number(raw);
    return describeEffectiveCachedMcpTools(
      context.runtime,
      context.services,
      Number.isFinite(limit) && limit > 0 ? limit : 20,
    );
  }

  if (trimmed.startsWith("/mcp describe ")) {
    const name = trimmed.replace("/mcp describe ", "").trim();
    if (!name) {
      return "Usage: /mcp describe <tool-name>";
    }
    return describeEffectiveMcpTool(context.runtime, context.services, name);
  }

  if (trimmed.startsWith("/mcp invoke ")) {
    const input = trimmed.replace("/mcp invoke ", "").trim();
    return JSON.stringify(
      await invokeEffectiveMcp(context.runtime, context.services, input),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/mcp call ")) {
    const payload = trimmed.replace("/mcp call ", "");
    const [toolName, inputRaw] = payload.split("::").map((part) => part.trim());
    if (!toolName) {
      return "Usage: /mcp call <toolName> :: <json-input>";
    }
    const parsedInput = inputRaw
      ? (JSON.parse(inputRaw) as Record<string, unknown>)
      : {};
    return JSON.stringify(
      await invokeEffectiveMcpTool(
        context.runtime,
        context.services,
        toolName,
        parsedInput,
      ),
      null,
      2,
    );
  }

  if (trimmed === "/acp" || trimmed === "/acp status") {
    return JSON.stringify(context.services.acp.status(), null, 2);
  }

  if (trimmed === "/acp registry") {
    return JSON.stringify(context.services.acp.registry(), null, 2);
  }

  if (trimmed === "/acp package") {
    return JSON.stringify(context.services.acp.packageMetadata(), null, 2);
  }

  if (trimmed === "/acp editor" || trimmed === "/acp install") {
    return JSON.stringify(context.services.acp.editorSummary(), null, 2);
  }

  if (trimmed === "/acp sessions") {
    return JSON.stringify(context.services.acp.sessionSummary(), null, 2);
  }

  if (trimmed === "/acp publish") {
    return JSON.stringify(context.services.acp.publishRegistry(), null, 2);
  }

  if (trimmed.startsWith("/acp export")) {
    const label = trimmed.replace("/acp export", "").trim() || "latest";
    return JSON.stringify(context.services.acp.exportBundle(label), null, 2);
  }

  if (trimmed.startsWith("/acp import ")) {
    const input = trimmed.replace("/acp import ", "").trim();
    if (!input) {
      return "Usage: /acp import <path-or-json>";
    }
    return JSON.stringify(context.services.acp.importBundle(input), null, 2);
  }

  if (trimmed === "/acp probe") {
    return JSON.stringify(await context.services.acp.probe(), null, 2);
  }

  if (trimmed === "/acp tools") {
    return JSON.stringify(context.services.acp.tools(), null, 2);
  }

  if (trimmed.startsWith("/acp search ")) {
    const query = trimmed.replace("/acp search ", "").trim();
    if (!query) {
      return "Usage: /acp search <query>";
    }
    return JSON.stringify(context.services.acp.searchTools(query), null, 2);
  }

  if (trimmed.startsWith("/acp describe ")) {
    const name = trimmed.replace("/acp describe ", "").trim();
    if (!name) {
      return "Usage: /acp describe <tool-name>";
    }
    return context.services.acp.describeTool(name);
  }

  if (trimmed.startsWith("/acp invoke ")) {
    const input = trimmed.replace("/acp invoke ", "").trim();
    return JSON.stringify(await context.services.acp.invoke(input), null, 2);
  }

  if (trimmed.startsWith("/acp call ")) {
    const payload = trimmed.replace("/acp call ", "");
    const [toolName, inputRaw] = payload.split("::").map((part) => part.trim());
    if (!toolName) {
      return "Usage: /acp call <toolName> :: <json-input>";
    }
    const parsedInput = inputRaw
      ? (JSON.parse(inputRaw) as Record<string, unknown>)
      : {};
    return JSON.stringify(
      await context.services.acp.invokeTool(toolName, parsedInput),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/web fetch ")) {
    const url = trimmed.replace("/web fetch ", "").trim();
    return JSON.stringify(
      await fetchEffectiveBrowserPage(context.runtime, context.services, url),
      null,
      2,
    );
  }

  if (trimmed === "/browser" || trimmed === "/browser status") {
    return JSON.stringify(
      await getEffectiveBrowserStatus(context.runtime, context.services),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/browser fetch ")) {
    const url = trimmed.replace("/browser fetch ", "").trim();
    return JSON.stringify(
      await fetchEffectiveBrowserPage(context.runtime, context.services, url),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/browser inspect ")) {
    const url = trimmed.replace("/browser inspect ", "").trim();
    return JSON.stringify(
      await inspectEffectiveBrowserPage(context.runtime, context.services, url),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/browser snapshot ")) {
    const url = trimmed.replace("/browser snapshot ", "").trim();
    return await snapshotEffectiveBrowserPage(
      context.runtime,
      context.services,
      url,
    );
  }

  if (trimmed.startsWith("/browser screenshot ")) {
    const url = trimmed.replace("/browser screenshot ", "").trim();
    return await screenshotEffectiveBrowserPage(
      context.runtime,
      context.services,
      url,
    );
  }

  if (trimmed.startsWith("/browser capture ")) {
    const url = trimmed.replace("/browser capture ", "").trim();
    return JSON.stringify(
      await captureEffectiveBrowserPage(context.runtime, context.services, url),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/browser analyze ")) {
    const url = trimmed.replace("/browser analyze ", "").trim();
    if (!url) {
      return "Usage: /browser analyze <url>";
    }
    const analysis = await analyzeEffectiveBrowserPage(
      context.runtime,
      context.services,
      url,
    );
    const response = await runModelAnalysisTurn(
      context,
      analysis.prompt,
      "browser",
      {
        personalityId: context.services.personalities.getActive().id,
      },
    );
    return JSON.stringify({ analysis, response }, null, 2);
  }

  if (trimmed.startsWith("/browser compare ")) {
    const payload = trimmed.replace("/browser compare ", "");
    const [leftUrl, rightUrl] = payload.split("::").map((part) => part.trim());
    if (!leftUrl || !rightUrl) {
      return "Usage: /browser compare <left-url> :: <right-url>";
    }
    return JSON.stringify(
      await compareEffectiveBrowserPages(
        context.runtime,
        context.services,
        leftUrl,
        rightUrl,
      ),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/browser compare analyze ")) {
    const payload = trimmed.replace("/browser compare analyze ", "");
    const [leftUrl, rightUrl] = payload.split("::").map((part) => part.trim());
    if (!leftUrl || !rightUrl) {
      return "Usage: /browser compare analyze <left-url> :: <right-url>";
    }
    const analysis = await analyzeEffectiveBrowserComparison(
      context.runtime,
      context.services,
      leftUrl,
      rightUrl,
    );
    const response = await runModelAnalysisTurn(
      context,
      analysis.prompt,
      "browser-comparison",
      {
        personalityId: context.services.personalities.getActive().id,
      },
    );
    return JSON.stringify({ analysis, response }, null, 2);
  }

  if (trimmed.startsWith("/web snapshot ")) {
    const url = trimmed.replace("/web snapshot ", "").trim();
    return await snapshotEffectiveBrowserPage(
      context.runtime,
      context.services,
      url,
    );
  }

  if (trimmed.startsWith("/web inspect ")) {
    const url = trimmed.replace("/web inspect ", "").trim();
    return JSON.stringify(
      await inspectEffectiveBrowserPage(context.runtime, context.services, url),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/media inspect ")) {
    const path = trimmed.replace("/media inspect ", "").trim();
    return JSON.stringify(context.services.media.inspect(path), null, 2);
  }

  if (trimmed.startsWith("/media transcript ")) {
    const path = trimmed.replace("/media transcript ", "").trim();
    const inspection = context.services.media.inspect(path);
    return inspection.transcriptPreview ?? "No transcript sidecar detected.";
  }

  if (trimmed.startsWith("/media caption ")) {
    const path = trimmed.replace("/media caption ", "").trim();
    const inspection = context.services.media.inspect(path);
    return inspection.captionPreview ?? "No caption sidecar detected.";
  }

  if (trimmed.startsWith("/media bundle ")) {
    const path = trimmed.replace("/media bundle ", "").trim();
    return JSON.stringify(context.services.media.bundle(path), null, 2);
  }

  if (trimmed.startsWith("/media analyze ")) {
    const path = trimmed.replace("/media analyze ", "").trim();
    if (!path) {
      return "Usage: /media analyze <path>";
    }
    return JSON.stringify(
      await context.services.media.analyzeWithModel(path),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/media transcribe ")) {
    const path = trimmed.replace("/media transcribe ", "").trim();
    if (!path) {
      return "Usage: /media transcribe <path>";
    }
    return JSON.stringify(
      await context.services.media.transcribeWithModel(path),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/media speak ")) {
    const text = trimmed.replace("/media speak ", "").trim();
    if (!text) {
      return "Usage: /media speak <text>";
    }
    return JSON.stringify(
      await context.services.media.speakWithModel(text),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/media voice ")) {
    const path = trimmed.replace("/media voice ", "").trim();
    if (!path) {
      return "Usage: /media voice <path>";
    }
    return JSON.stringify(
      await context.services.media.voiceWithModel(path),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/media vision ")) {
    const path = trimmed.replace("/media vision ", "").trim();
    if (!path) {
      return "Usage: /media vision <path>";
    }
    return JSON.stringify(
      await context.services.media.visionWithModel(path),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/media generate ")) {
    const prompt = trimmed.replace("/media generate ", "").trim();
    if (!prompt) {
      return "Usage: /media generate <prompt>";
    }
    return JSON.stringify(
      await context.services.media.generateImage(prompt),
      null,
      2,
    );
  }

  if (
    trimmed === "/delegate" ||
    trimmed === "/delegate list" ||
    trimmed.startsWith("/delegate list ")
  ) {
    const raw =
      trimmed === "/delegate" || trimmed === "/delegate list"
        ? ""
        : trimmed.replace("/delegate list", "").trim();
    const filters = raw ? parseDelegationFilter(raw) : {};
    const nativeTasks = getEffectiveDelegationTasks(
      context.runtime,
      context.services,
    );
    if (
      !filters.group &&
      !filters.profile &&
      !filters.priority &&
      !filters.label &&
      !filters.parentTaskId &&
      !filters.status &&
      !filters.executionMode &&
      Array.isArray(nativeTasks) &&
      nativeTasks.length
    ) {
      return JSON.stringify(nativeTasks.slice(0, 20), null, 2);
    }
    const tasks = context.services.delegation
      .list({
        group: filters.group,
        profile: filters.profile,
        priority: filters.priority,
        label: filters.label,
        parentTaskId: filters.parentTaskId,
        status: filters.status,
        executionMode: filters.executionMode,
      })
      .slice(0, 20);
    return tasks.length
      ? tasks
          .map(
            (task) =>
              `- ${task.id} ${task.title} [${task.status}] mode=${task.executionMode}/${task.workerMode ?? "inline"} group=${task.group ?? task.profile ?? "default"} priority=${task.priority ?? "normal"} profile=${task.profile ?? "default"} attempts=${task.attempts ?? 0}${task.workerPid ? ` pid=${task.workerPid}` : ""}\n  labels=${task.labels?.join(",") || task.tags?.join(",") || "none"}\n  parent=${task.parentTaskId ?? "root"} children=${task.childTaskIds?.length ?? 0}\n  ${task.objective}`,
          )
          .join("\n")
      : "No delegation tasks recorded.";
  }

  if (trimmed === "/delegate overview") {
    return JSON.stringify(
      {
        local: getEffectiveDelegationOverview(
          context.runtime,
          context.services,
        ),
        native: getEffectiveDelegationQueue(context.runtime, context.services),
      },
      null,
      2,
    );
  }

  if (trimmed === "/delegate queue" || trimmed.startsWith("/delegate queue ")) {
    const nativeQueue = getEffectiveDelegationQueue(
      context.runtime,
      context.services,
    );
    if (trimmed === "/delegate queue" && nativeQueue) {
      return JSON.stringify(nativeQueue, null, 2);
    }
    const raw =
      trimmed === "/delegate queue"
        ? ""
        : trimmed.replace("/delegate queue", "").trim();
    const filters = raw ? parseDelegationFilter(raw) : {};
    const tasks = context.services.delegation
      .pending({
        group: filters.group,
        profile: filters.profile,
        priority: filters.priority,
        label: filters.label,
        parentTaskId: filters.parentTaskId,
        status: filters.status,
        executionMode: filters.executionMode,
      })
      .slice(0, 20);
    return tasks.length
      ? tasks
          .map(
            (task) =>
              `- ${task.id} ${task.title} [${task.status}] attempts=${task.attempts ?? 0}/${task.maxAttempts ?? 3}`,
          )
          .join("\n")
      : "No queued delegation tasks.";
  }

  if (trimmed.startsWith("/delegate group ")) {
    const group = trimmed.replace("/delegate group ", "").trim();
    if (!group) {
      return "Usage: /delegate group <group-name>";
    }
    const tasks = context.services.delegation.listByGroup(group);
    return tasks.length
      ? tasks
          .map(
            (task) =>
              `- ${task.id} ${task.title} [${task.status}] profile=${task.profile ?? "default"} labels=${task.labels?.join(",") || "none"}\n  ${task.objective}`,
          )
          .join("\n\n")
      : `No delegation tasks found for group ${group}.`;
  }

  if (trimmed.startsWith("/delegate label ")) {
    const label = trimmed.replace("/delegate label ", "").trim();
    if (!label) {
      return "Usage: /delegate label <label>";
    }
    const tasks = context.services.delegation.listByLabel(label);
    return tasks.length
      ? tasks
          .map(
            (task) =>
              `- ${task.id} ${task.title} [${task.status}] group=${task.group ?? task.profile ?? "default"}\n  ${task.objective}`,
          )
          .join("\n\n")
      : `No delegation tasks found for label ${label}.`;
  }

  if (trimmed.startsWith("/delegate children ")) {
    const id = trimmed.replace("/delegate children ", "").trim();
    if (!id) {
      return "Usage: /delegate children <parent-id>";
    }
    const tasks = getEffectiveDelegationChildren(
      context.runtime,
      context.services,
      id,
    ) as Array<{
      id: string;
      title: string;
      status: string;
      group?: string;
      profile?: string;
      parentTaskId?: string;
      labels?: string[];
      tags?: string[];
      objective: string;
    }>;
    return tasks.length
      ? tasks
          .map(
            (task) =>
              `- ${task.id} ${task.title} [${task.status}] group=${task.group ?? task.profile ?? "default"} parent=${task.parentTaskId ?? "root"}\n  labels=${task.labels?.join(",") || task.tags?.join(",") || "none"}\n  ${task.objective}`,
          )
          .join("\n\n")
      : `No child delegation tasks found for ${id}.`;
  }

  if (trimmed.startsWith("/delegate tree ")) {
    const id = trimmed.replace("/delegate tree ", "").trim();
    if (!id) {
      return "Usage: /delegate tree <task-id>";
    }
    return JSON.stringify(
      getEffectiveDelegationTree(context.runtime, context.services, id),
      null,
      2,
    );
  }

  if (
    trimmed === "/delegate supervise" ||
    trimmed.startsWith("/delegate supervise ")
  ) {
    const raw = trimmed.replace("/delegate supervise", "").trim();
    const parsed = parseDelegationFilter(raw);
    const report = await context.services.delegation.superviseQueued(
      async (task) => {
        const completedTask = await runDelegationTaskInWorker(
          context,
          task.id,
          {
            assumeRunning: true,
          },
        );
        return completedTask.notes.at(-1) ?? "Delegated worker completed.";
      },
      {
        concurrency:
          Number.isFinite(parsed.concurrency) &&
          (parsed.concurrency as number) > 0
            ? (parsed.concurrency as number)
            : 2,
        filter: {
          group: parsed.group,
          profile: parsed.profile,
          priority: parsed.priority,
          label: parsed.label,
          parentTaskId: parsed.parentTaskId,
          status: parsed.status,
          executionMode: parsed.executionMode,
        },
        onComplete: async (task) => {
          context.services.skillSynthesis.synthesizeFromTask(task);
        },
        onError: async (task, error) => {
          context.services.delegation.addNote(
            task.id,
            `system: supervision error ${error}`,
          );
        },
      },
    );
    return JSON.stringify(report, null, 2);
  }

  if (trimmed.startsWith("/delegate create ")) {
    const payload = trimmed.replace("/delegate create ", "");
    const parsed = parseDelegationSegments(payload);
    if (!parsed) {
      return "Usage: /delegate create <title> | group:research | profile:research | priority:high | labels:browser,voice | metadata:owner=alice :: <objective>";
    }
    const task = createEffectiveDelegationTask(
      context.runtime,
      context.services,
      {
        title: parsed.head,
        objective: parsed.objective,
        group: parsed.options.group,
        profile: parsed.options.profile,
        priority:
          parsed.options.priority === "low" ||
          parsed.options.priority === "normal" ||
          parsed.options.priority === "high"
            ? parsed.options.priority
            : "normal",
        tags: parseDelegationLabels(
          parsed.options.labels ?? parsed.options.tags,
        ),
        labels: parseDelegationLabels(
          parsed.options.labels ?? parsed.options.tags,
        ),
        metadata: parseDelegationMetadata(
          parsed.options.metadata ?? parsed.options.meta,
        ),
        executionMode: "delegated",
      },
    );
    return JSON.stringify(task, null, 2);
  }

  if (trimmed.startsWith("/delegate spawn ")) {
    const payload = trimmed.replace("/delegate spawn ", "");
    const parsed = parseDelegationSpawnSegments(payload);
    if (!parsed) {
      return "Usage: /delegate spawn <parent-id> | title:Child Task | group:research | profile:research | priority:high | labels:browser :: <objective>";
    }
    const child = context.services.delegation.spawnChild(parsed.parentId, {
      title: parsed.options.title ?? `${parsed.parentId} child`,
      objective: parsed.objective,
      group: parsed.options.group,
      profile: parsed.options.profile,
      priority:
        parsed.options.priority === "low" ||
        parsed.options.priority === "normal" ||
        parsed.options.priority === "high"
          ? parsed.options.priority
          : undefined,
      tags: parseDelegationLabels(parsed.options.labels ?? parsed.options.tags),
      labels: parseDelegationLabels(
        parsed.options.labels ?? parsed.options.tags,
      ),
      metadata: parseDelegationMetadata(
        parsed.options.metadata ?? parsed.options.meta,
      ),
      executionMode: "delegated",
    });
    return JSON.stringify(child, null, 2);
  }

  if (trimmed.startsWith("/delegate note ")) {
    const payload = trimmed.replace("/delegate note ", "");
    const [id, note] = payload.split("::").map((part) => part.trim());
    if (!id || !note) {
      return "Usage: /delegate note <id> :: <note>";
    }
    return JSON.stringify(
      context.services.delegation.addNote(id, note),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/delegate status ")) {
    const id = trimmed.replace("/delegate status ", "").trim();
    return JSON.stringify(
      getEffectiveDelegationTask(context.runtime, context.services, id),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/delegate run ")) {
    const id = trimmed.replace("/delegate run ", "").trim();
    return JSON.stringify(context.services.delegation.markRunning(id), null, 2);
  }

  if (trimmed.startsWith("/delegate execute ")) {
    const id = trimmed.replace("/delegate execute ", "").trim();
    return JSON.stringify(
      await runDelegationTaskInWorker(context, id),
      null,
      2,
    );
  }

  if (
    trimmed === "/delegate execute-queued" ||
    trimmed.startsWith("/delegate execute-queued ")
  ) {
    const raw = trimmed.replace("/delegate execute-queued", "").trim();
    const concurrency = raw ? Number(raw) : undefined;
    const report = await context.services.delegation.superviseQueued(
      async (task) => {
        const completedTask = await runDelegationTaskInWorker(
          context,
          task.id,
          {
            assumeRunning: true,
          },
        );
        return completedTask.notes.at(-1) ?? "Delegated worker completed.";
      },
      {
        concurrency:
          Number.isFinite(concurrency) && (concurrency as number) > 0
            ? (concurrency as number)
            : 2,
        onComplete: async (task) => {
          context.services.skillSynthesis.synthesizeFromTask(task);
        },
        onError: async (task, error) => {
          context.services.delegation.addNote(
            task.id,
            `system: queue error ${error}`,
          );
        },
      },
    );
    return JSON.stringify(report, null, 2);
  }

  if (
    trimmed === "/delegate workers" ||
    trimmed.startsWith("/delegate workers ")
  ) {
    const raw =
      trimmed === "/delegate workers"
        ? ""
        : trimmed.replace("/delegate workers", "").trim();
    const filters = raw ? parseDelegationFilter(raw) : {};
    const overview = context.services.delegation.overview();
    const tasks = context.services.delegation.workers(20, {
      group: filters.group,
      profile: filters.profile,
      priority: filters.priority,
      label: filters.label,
      parentTaskId: filters.parentTaskId,
      status: filters.status,
      executionMode: filters.executionMode,
    });
    const lines = [
      `Workers: active=${overview.activeWorkers} alive=${overview.aliveWorkers} stalled=${overview.stalledWorkers} running=${overview.running} pending=${overview.pending} completed=${overview.completed} failed=${overview.failed}`,
      `Groups: ${overview.byGroup.map((entry) => `${entry.group}=${entry.count}`).join(", ") || "none"}`,
      `Labels: ${overview.byLabel.map((entry) => `${entry.label}=${entry.count}`).join(", ") || "none"}`,
      "",
      tasks.length
        ? tasks
            .map(
              (task) =>
                `- ${task.id} [${task.status}] ${task.title}\n  pid=${task.workerPid ?? "none"} alive=${task.alive} stalled=${task.stalled} attempts=${task.attempts}/${task.maxAttempts} remaining=${task.attemptsRemaining}${task.durationMs !== undefined ? ` duration=${task.durationMs}ms` : ""}\n  profile=${task.profile ?? "default"} priority=${task.priority ?? "normal"} tags=${task.tags?.join(",") || "none"}\n  output=${task.lastOutputPath ?? "n/a"}`,
            )
            .join("\n\n")
        : "No delegated worker tasks recorded.",
    ];
    return lines.join("\n");
  }

  if (trimmed.startsWith("/delegate retry ")) {
    const payload = trimmed.replace("/delegate retry ", "");
    const [left, note] = payload.split("::").map((part) => part.trim());
    const segments = left
      .split("|")
      .map((segment) => segment.trim())
      .filter(Boolean);
    const [id, ...rawOptions] = segments;
    const cascadeChildren = rawOptions.some((segment) => {
      const [key, value] = segment
        .split(":")
        .map((part) => part.trim().toLowerCase());
      return (
        key === "cascade" &&
        (value === "children" || value === "child" || value === "true")
      );
    });
    if (!id) {
      return "Usage: /delegate retry <id> [| cascade:children] :: <optional note>";
    }
    return JSON.stringify(
      retryEffectiveDelegationTask(
        context.runtime,
        context.services,
        id,
        note || "Requeued for retry.",
        cascadeChildren ? { cascadeChildren: true } : undefined,
      ),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/retry ")) {
    return handleAgentTurn(
      {
        message: `/delegate retry ${trimmed.replace("/retry ", "").trim()}`,
        userId: currentCliSessionId(context),
        roomId: currentCliSessionId(context),
        source: "cli",
      },
      context,
    );
  }

  if (trimmed.startsWith("/delegate cancel ")) {
    const payload = trimmed.replace("/delegate cancel ", "");
    const [id, note] = payload.split("::").map((part) => part.trim());
    if (!id) {
      return "Usage: /delegate cancel <id> :: <optional note>";
    }
    return JSON.stringify(
      context.services.delegation.cancel(id, note || "Cancelled by operator."),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/delegate complete ")) {
    const payload = trimmed.replace("/delegate complete ", "");
    const [id, note] = payload.split("::").map((part) => part.trim());
    if (!id) {
      return "Usage: /delegate complete <id> :: <optional note>";
    }
    return JSON.stringify(
      context.services.delegation.complete(id, note),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/skills synthesize ")) {
    const id = trimmed.replace("/skills synthesize ", "").trim();
    const task = context.services.delegation
      .list()
      .find((entry) => entry.id === id);
    if (!task) {
      return `Delegation task not found: ${id}`;
    }
    return context.services.skillSynthesis.synthesizeFromTask(task);
  }

  if (trimmed === "/trajectories export") {
    const nativeExport = getNativeServices(
      context.runtime,
    ).trajectoryLogger?.exportLatest();
    return typeof nativeExport === "string"
      ? nativeExport
      : context.services.trajectories.exportRecent(200);
  }

  if (trimmed.startsWith("/trajectories export ")) {
    const options = parseTrajectoryArgs(
      trimmed.replace("/trajectories export ", ""),
    );
    return context.services.trajectories.exportDataset({
      ...options,
      limit: options.limit ?? 200,
      mode: options.mode ?? "dataset",
      purpose: options.purpose ?? "trajectory export",
    });
  }

  if (trimmed === "/trajectories bundle") {
    return JSON.stringify(
      context.services.trajectories.exportBundle(200),
      null,
      2,
    );
  }

  if (
    trimmed === "/trajectories analyze" ||
    trimmed.startsWith("/trajectories analyze ")
  ) {
    const options =
      trimmed === "/trajectories analyze"
        ? { limit: 200 }
        : parseTrajectoryArgs(trimmed.replace("/trajectories analyze ", ""));
    return JSON.stringify(
      context.services.trajectories.analyze({
        ...options,
        limit: options.limit ?? 200,
        mode: options.mode ?? "research",
        purpose: options.purpose ?? "trajectory research",
        tags: options.tags,
        notes: options.notes,
      }),
      null,
      2,
    );
  }

  if (
    trimmed === "/trajectories evaluate" ||
    trimmed.startsWith("/trajectories evaluate ")
  ) {
    const options =
      trimmed === "/trajectories evaluate"
        ? { limit: 200 }
        : parseTrajectoryArgs(trimmed.replace("/trajectories evaluate ", ""));
    return JSON.stringify(
      await context.services.trajectories.evaluate({
        ...options,
        limit: options.limit ?? 200,
        mode: options.mode ?? "evaluation",
        purpose: options.purpose ?? "trajectory evaluation",
        tags: options.tags,
        notes: options.notes,
        rubric: options.rubric,
      }),
      null,
      2,
    );
  }

  if (
    trimmed === "/trajectories package" ||
    trimmed.startsWith("/trajectories package ")
  ) {
    const options =
      trimmed === "/trajectories package"
        ? { limit: 200 }
        : parseTrajectoryArgs(trimmed.replace("/trajectories package ", ""));
    return JSON.stringify(
      await context.services.trajectories.package({
        ...options,
        limit: options.limit ?? 200,
        mode: options.mode ?? "research",
        purpose: options.purpose ?? "trajectory research package",
        tags: options.tags,
        notes: options.notes,
        rubric: options.rubric,
      }),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/trajectories bundle ")) {
    const options = parseTrajectoryArgs(
      trimmed.replace("/trajectories bundle ", ""),
    );
    return JSON.stringify(
      context.services.trajectories.exportFilteredBundle({
        ...options,
        limit: options.limit ?? 200,
        mode: options.mode ?? "research",
        purpose: options.purpose ?? "trajectory research",
        tags: options.tags,
        notes: options.notes,
      }),
      null,
      2,
    );
  }

  if (trimmed === "/trajectories list") {
    const bundles =
      (getNativeServices(context.runtime).trajectoryLogger?.bundles() as Array<{
        label: string;
        createdAt: string;
        messageCount: number;
        sessionCount: number;
        filters?: { sessionId?: string | null; role?: string | null };
        dataPath?: string;
      }>) ?? context.services.trajectories.listBundles(10);
    return bundles.length
      ? bundles
          .map(
            (bundle) =>
              `- ${bundle.label} [${bundle.createdAt}] messages=${bundle.messageCount} sessions=${bundle.sessionCount} filters=session:${bundle.filters?.sessionId ?? "any"} role:${bundle.filters?.role ?? "any"}\n  data=${bundle.dataPath}`,
          )
          .join("\n\n")
      : "No trajectory bundles recorded.";
  }

  if (
    trimmed === "/trajectories benchmark environment" ||
    trimmed === "/trajectories benchmarks environment"
  ) {
    return JSON.stringify(
      context.services.trajectories.describeBenchmarkEnvironment(),
      null,
      2,
    );
  }

  if (
    trimmed === "/trajectories benchmark list" ||
    trimmed === "/trajectories benchmarks"
  ) {
    const manifests = context.services.trajectories.listBenchmarkManifests(10);
    return manifests.length
      ? manifests
          .map(
            (entry) =>
              `- ${entry.label} [${entry.createdAt}] cases=${entry.cases.length} group=${entry.group}\n  manifest=${entry.manifestPath}`,
          )
          .join("\n\n")
      : "No trajectory benchmark manifests recorded.";
  }

  if (trimmed.startsWith("/trajectories benchmark create ")) {
    const payload = trimmed.replace("/trajectories benchmark create ", "");
    const [optionsRaw, casesRaw] = payload
      .split("::")
      .map((part) => part.trim());
    const options = parseTrajectoryArgs(optionsRaw ?? "");
    const cases = parseTrajectoryBenchmarkCases(casesRaw ?? "");
    if (!cases.length) {
      return "Usage: /trajectories benchmark create label:<name> rubric:a,b :: label:baseline => label:target";
    }
    return JSON.stringify(
      context.services.trajectories.createBenchmarkManifest({
        label: options.label,
        purpose: options.purpose,
        tags: options.tags,
        rubric: options.rubric,
        group: options.notes,
        cases,
      }),
      null,
      2,
    );
  }

  if (trimmed === "/trajectories benchmark run latest") {
    const run = await context.services.trajectories.runLatestBenchmark();
    return run
      ? JSON.stringify(run, null, 2)
      : "No trajectory benchmark manifests recorded.";
  }

  if (trimmed.startsWith("/trajectories benchmark run ")) {
    const raw = trimmed.replace("/trajectories benchmark run ", "").trim();
    if (!raw) {
      return "Usage: /trajectories benchmark run <manifest-path|label|latest>";
    }
    if (raw === "latest") {
      const run = await context.services.trajectories.runLatestBenchmark();
      return run
        ? JSON.stringify(run, null, 2)
        : "No trajectory benchmark manifests recorded.";
    }
    const manifests = context.services.trajectories.listBenchmarkManifests(50);
    const resolved = raw.endsWith(".json")
      ? raw
      : manifests.find(
          (entry) => entry.label === raw || entry.manifestPath.endsWith(raw),
        )?.manifestPath;
    if (!resolved) {
      return `Trajectory benchmark manifest not found: ${raw}`;
    }
    return JSON.stringify(
      await context.services.trajectories.runBenchmark(resolved),
      null,
      2,
    );
  }

  if (trimmed === "/trajectories replay latest") {
    const replay = context.services.trajectories.replayLatest();
    return replay
      ? JSON.stringify(replay, null, 2)
      : "No trajectory bundles recorded.";
  }

  if (trimmed === "/trajectories compare latest") {
    const comparison =
      getNativeServices(context.runtime).trajectoryLogger?.compareLatest() ??
      context.services.trajectories.compareLatest();
    return comparison
      ? JSON.stringify(comparison, null, 2)
      : "At least two trajectory bundles are required for comparison.";
  }

  if (trimmed === "/trajectories ingest gateway") {
    if (!context.gateway) {
      return "Gateway runtime is not available in this execution context.";
    }
    const history = await context.gateway.history(200);
    return JSON.stringify(
      context.services.trajectories.ingestGatewayHistory({
        traces: history.traces,
        inbox: history.inbox,
        outbox: history.outbox,
        label: "gateway-history",
        purpose: "gateway history ingest",
        tags: ["gateway", "history"],
      }),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/trajectories ingest gateway ")) {
    if (!context.gateway) {
      return "Gateway runtime is not available in this execution context.";
    }
    const options = parseTrajectoryArgs(
      trimmed.replace("/trajectories ingest gateway ", ""),
    );
    const history = await context.gateway.history(options.limit ?? 200);
    return JSON.stringify(
      context.services.trajectories.ingestGatewayHistory({
        traces: history.traces,
        inbox: history.inbox,
        outbox: history.outbox,
        label: options.label ?? "gateway-history",
        purpose: options.purpose ?? "gateway history ingest",
        tags: options.tags ?? ["gateway", "history"],
        notes: options.notes,
      }),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/trajectories compare ")) {
    const raw = trimmed.replace("/trajectories compare ", "").trim();
    const [leftRaw, rightRaw] = raw.split("::").map((part) => part.trim());
    if (!leftRaw || !rightRaw) {
      return "Usage: /trajectories compare <left-manifest|label> :: <right-manifest|label>";
    }
    const bundles = context.services.trajectories.listBundles(100);
    const resolveBundle = (value: string) => {
      if (value.endsWith(".json")) {
        return value;
      }
      return (
        bundles.find(
          (entry) =>
            entry.label === value || entry.manifestPath.endsWith(value),
        )?.manifestPath ?? value
      );
    };
    return JSON.stringify(
      context.services.trajectories.compareBundles(
        resolveBundle(leftRaw),
        resolveBundle(rightRaw),
      ),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/trajectories batch ")) {
    const payload = trimmed.replace("/trajectories batch ", "");
    const [optionsRaw, promptsRaw] = payload
      .split("::")
      .map((part) => part.trim());
    const options = parseTrajectoryArgs(optionsRaw);
    const prompts = (promptsRaw ?? "")
      .split("=>")
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (!prompts.length) {
      return "Usage: /trajectories batch label:<name> rubric:a,b :: prompt one => prompt two";
    }
    const label = options.label ?? `trajectory-batch-${Date.now()}`;
    const group = `trajectory-batch:${label}`;
    const tasks = prompts.map((prompt, index) =>
      context.services.delegation.create({
        title: `Batch prompt ${index + 1}`,
        objective: prompt,
        group,
        profile: "research",
        priority: "normal",
        labels: ["trajectory", "batch"],
        metadata: {
          source: "trajectory-batch",
          label,
        },
        executionMode: "local",
      }),
    );
    return JSON.stringify(
      {
        batch: context.services.trajectories.createBatchManifest({
          label,
          purpose: options.purpose ?? "trajectory batch",
          prompts,
          rubric: options.rubric,
          tags: options.tags,
          taskIds: tasks.map((task) => task.id),
          group,
        }),
        tasks,
      },
      null,
      2,
    );
  }

  if (trimmed === "/trajectories compress latest") {
    const compressed = context.services.trajectories.compressLatest();
    return compressed
      ? JSON.stringify(compressed, null, 2)
      : "No trajectory bundles recorded.";
  }

  if (trimmed === "/compress") {
    const compressed = context.services.trajectories.compressLatest();
    return compressed
      ? JSON.stringify(compressed, null, 2)
      : "No trajectory bundles are available yet.";
  }

  if (trimmed.startsWith("/compress ")) {
    return handleAgentTurn(
      {
        message: `/trajectories compress ${trimmed.replace("/compress ", "").trim()}`,
        userId: currentCliSessionId(context),
        roomId: currentCliSessionId(context),
        source: "cli",
      },
      context,
    );
  }

  if (trimmed.startsWith("/trajectories compress ")) {
    const raw = trimmed.replace("/trajectories compress ", "").trim();
    if (!raw) {
      return "Usage: /trajectories compress <manifest-path|bundle-label|latest>";
    }
    if (raw === "latest") {
      const compressed = context.services.trajectories.compressLatest();
      return compressed
        ? JSON.stringify(compressed, null, 2)
        : "No trajectory bundles recorded.";
    }
    const bundles = context.services.trajectories.listBundles(50);
    const bundle = raw.endsWith(".json")
      ? raw
      : bundles.find(
          (entry) => entry.label === raw || entry.manifestPath.endsWith(raw),
        );
    if (typeof bundle === "string") {
      return JSON.stringify(
        context.services.trajectories.compressBundle(bundle),
        null,
        2,
      );
    }
    if (!bundle) {
      return `Trajectory bundle not found: ${raw}`;
    }
    return JSON.stringify(
      context.services.trajectories.compressBundle(bundle.manifestPath),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/trajectories replay ")) {
    const raw = trimmed.replace("/trajectories replay ", "").trim();
    if (!raw) {
      return "Usage: /trajectories replay <manifest-path|bundle-label|latest>";
    }
    if (raw === "latest") {
      const replay = context.services.trajectories.replayLatest();
      return replay
        ? JSON.stringify(replay, null, 2)
        : "No trajectory bundles recorded.";
    }
    const bundles = context.services.trajectories.listBundles(50);
    const bundle = raw.endsWith(".json")
      ? raw
      : bundles.find(
          (entry) => entry.label === raw || entry.manifestPath.endsWith(raw),
        );
    if (typeof bundle === "string") {
      return JSON.stringify(
        context.services.trajectories.replayBundle(bundle),
        null,
        2,
      );
    }
    if (!bundle) {
      return `Trajectory bundle not found: ${raw}`;
    }
    return JSON.stringify(
      context.services.trajectories.replayBundle(bundle.manifestPath),
      null,
      2,
    );
  }

  return undefined;
}

export async function handleAgentTurn(
  input: ChatTurnRequest,
  context: AgentExecutionContext,
  options?: {
    runtimeOverrides?: CronJobRuntimeOverrides;
    personalityId?: string;
  },
): Promise<string> {
  const responseFromCommandLayer = await buildCommandResponse(input, context);
  const roomKey = input.roomId ?? `room:${input.userId}`;
  const roomId = stringToUuid(roomKey);
  const worldId = stringToUuid("eliza-agent-world");
  const entityId = stringToUuid(input.userId);
  const sessionId = roomKey;

  context.services.userProfiles.observe(
    input.userId,
    input.message,
    input.source,
    {
      source: input.source,
      channel: input.source,
      sessionId,
      signal: input.message.slice(0, 160),
    },
  );

  context.services.sessions.storeMessage({
    id: randomUUID(),
    sessionId,
    roomId,
    entityId,
    role: "user",
    text: input.message,
    createdAt: nowIso(),
  });

  if (responseFromCommandLayer) {
    context.services.sessions.storeMessage({
      id: randomUUID(),
      sessionId,
      roomId,
      entityId,
      role: "assistant",
      text: responseFromCommandLayer,
      createdAt: nowIso(),
    });
    return responseFromCommandLayer;
  }

  let response = "";
  const personalityBefore = context.services.personalities.getActive();
  const settingsBefore = context.services.settings.get();
  const settingsDuring = applyRuntimeOverrides(
    settingsBefore,
    options?.runtimeOverrides,
  );

  const readinessMessage = await getProviderReadinessMessage(
    context,
    settingsDuring.model.provider,
  );
  if (readinessMessage) {
    context.services.sessions.storeMessage({
      id: randomUUID(),
      sessionId,
      roomId,
      entityId,
      role: "assistant",
      text: readinessMessage,
      createdAt: nowIso(),
    });
    return readinessMessage;
  }

  await context.runtime.ensureConnection({
    entityId: entityId as UUID,
    roomId: roomId as UUID,
    worldId: worldId as UUID,
    userName: input.userId,
    source: input.source ?? "cli",
    channelId: roomKey,
    serverId: "eliza-agent",
    type: ChannelType.DM,
  } as Parameters<typeof context.runtime.ensureConnection>[0]);

  const memory = createMessageMemory({
    id: randomUUID() as UUID,
    entityId: entityId as UUID,
    roomId: roomId as UUID,
    content: {
      text: input.message,
      source: input.source ?? "cli",
      channelType: ChannelType.DM,
    },
  });

  if (
    settingsDuring.model.provider !== settingsBefore.model.provider ||
    settingsDuring.model.model !== settingsBefore.model.model ||
    settingsDuring.model.baseUrl !== settingsBefore.model.baseUrl ||
    settingsDuring.model.temperature !== settingsBefore.model.temperature ||
    settingsDuring.model.maxTokens !== settingsBefore.model.maxTokens
  ) {
    context.services.settings.set(
      "model.provider",
      settingsDuring.model.provider,
    );
    context.services.settings.set("model.model", settingsDuring.model.model);
    context.services.settings.set(
      "model.baseUrl",
      settingsDuring.model.baseUrl,
    );
    context.services.settings.set(
      "model.temperature",
      settingsDuring.model.temperature,
    );
    context.services.settings.set(
      "model.maxTokens",
      settingsDuring.model.maxTokens,
    );
    syncProviderSettings(context, context.services.settings.get());
  }

  if (
    options?.personalityId &&
    options.personalityId !== personalityBefore.id
  ) {
    context.services.personalities.setActive(options.personalityId);
  }

  try {
    await context.runtime.messageService?.handleMessage(
      context.runtime,
      memory,
      async (content) => {
        if (content?.text) {
          response += content.text;
        }
        return [];
      },
    );
  } finally {
    if (
      settingsDuring.model.provider !== settingsBefore.model.provider ||
      settingsDuring.model.model !== settingsBefore.model.model ||
      settingsDuring.model.baseUrl !== settingsBefore.model.baseUrl ||
      settingsDuring.model.temperature !== settingsBefore.model.temperature ||
      settingsDuring.model.maxTokens !== settingsBefore.model.maxTokens
    ) {
      context.services.settings.set(
        "model.provider",
        settingsBefore.model.provider,
      );
      context.services.settings.set("model.model", settingsBefore.model.model);
      context.services.settings.set(
        "model.baseUrl",
        settingsBefore.model.baseUrl,
      );
      context.services.settings.set(
        "model.temperature",
        settingsBefore.model.temperature,
      );
      context.services.settings.set(
        "model.maxTokens",
        settingsBefore.model.maxTokens,
      );
      syncProviderSettings(context, context.services.settings.get());
    }

    if (
      options?.personalityId &&
      options.personalityId !== personalityBefore.id
    ) {
      context.services.personalities.setActive(personalityBefore.id);
    }
  }

  const finalResponse =
    response.trim() || "The runtime completed without producing a response.";

  context.services.sessions.storeMessage({
    id: randomUUID(),
    sessionId,
    roomId,
    entityId,
    role: "assistant",
    text: finalResponse,
    createdAt: nowIso(),
  });

  return finalResponse;
}

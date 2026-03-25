import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { arch, hostname, platform, release } from "node:os";
import { join } from "node:path";
import { resolveCloudApiBaseUrl } from "@elizaos/agent/cloud/base-url";
import { validateCloudBaseUrl } from "@elizaos/agent/cloud/validate-url";
import { resolveStreamingUpdate } from "@elizaos/autonomous/api/streaming-text";
import {
  ChannelType,
  type Content,
  createMessageMemory,
  createUniqueUuid,
  EventType,
  initializeOnboarding,
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
  normalizeSlashCommandSyntax,
  renderCommandCatalog,
} from "@/runtime/command-catalog";
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
  cancelEffectiveDelegationTask,
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
  getEffectiveCodingAgentContext,
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
  getEffectiveRepositoryDiff,
  getEffectiveRepositoryLog,
  getEffectiveRepositoryStatus,
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
  getEffectiveTurnCapabilityPolicy,
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
  readEffectiveWorkspaceFile,
  retryEffectiveDelegationTask,
  runEffectiveShellCommand,
  screenshotEffectiveBrowserPage,
  searchEffectiveCachedMcpTools,
  searchEffectiveSkillHubCatalog,
  searchEffectiveWorkspace,
  setEffectiveSecret,
  snapshotEffectiveBrowserPage,
  spawnEffectiveDelegationChild,
  superviseEffectiveDelegationQueue,
  syncEffectiveSkillHub,
  writeEffectiveWorkspaceFile,
} from "@/runtime/native/service-bridge";
import {
  DEFAULT_TUI_THEME,
  getTuiTheme,
  listTuiThemes,
  nextTuiTheme,
  previousTuiTheme,
  resolveTuiThemeName,
} from "@/runtime/theme-catalog";
import {
  classifyTurnMessage,
  deriveTurnExecutionPolicy,
  isSimpleGreetingMessage,
  resolveTurnCapabilityProfile,
} from "@/runtime/turn-classification";
import { resolveWorkflowCommandPrompt } from "@/runtime/workflow-commands";
import type { RuntimeSettings } from "@/services/settings-service";
import type {
  ChatTurnRequest,
  CronJobRuntimeOverrides,
  MemoryTarget,
  PlatformName,
  RunDepth,
  ToolProgressMode,
  UserProfileWorkspaceSummary,
} from "@/types";
import { RUN_DEPTH_ITERATION_PRESETS } from "@/types";
import { sanitizeTerminalText } from "@/utils/terminal-text";
import type { AppContext } from "./bootstrap";

type StreamSource = "unset" | "callback" | "onStreamChunk";

const INFORMATIONAL_RESPONSE_CACHE_TTL_MS = 45_000;

const informationalResponseCache = new Map<
  string,
  {
    expiresAt: number;
    text: string;
  }
>();

function stableRuntimeUuid(seed: string): UUID {
  const hash = createHash("sha256").update(seed).digest("hex");
  const variantNibble = (
    (Number.parseInt(hash.slice(16, 17), 16) & 0x3) |
    0x8
  ).toString(16);
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `${variantNibble}${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join("-") as UUID;
}

function extractCompatTextContent(content: Content | null | undefined): string {
  if (!content) {
    return "";
  }
  if (typeof content.text === "string" && content.text.length > 0) {
    return content.text;
  }
  return "";
}

export type AgentExecutionContext = Pick<
  AppContext,
  "config" | "services" | "runtime"
> & {
  gateway?: AppContext["gateway"];
};

export interface AgentTurnHooks {
  onResponseProgress?: (update: {
    chunk: string;
    response: string;
    phase: "command" | "readiness" | "model";
  }) => void | Promise<void>;
  onNotice?: (notice: {
    kind: "context" | "skills" | "status";
    message: string;
  }) => void | Promise<void>;
  runLocalShellCommand?: (params: {
    command: string;
    afterSuccessConnectProvider?: LinkedProviderName;
  }) => Promise<string>;
  abortSignal?: AbortSignal;
}

const REMOTE_EXECUTION_PLATFORMS = new Set<PlatformName>([
  "telegram",
  "discord",
  "slack",
  "whatsapp",
  "signal",
  "matrix",
  "email",
  "sms",
  "mattermost",
  "homeassistant",
  "dingtalk",
]);

const SAFE_REMOTE_EXECUTION_PREFIXES = [
  "pwd",
  "ls",
  "find",
  "cat",
  "head",
  "tail",
  "echo",
  "printf",
  "rg",
  "grep",
  "git status",
  "git diff",
  "git log",
  "git show",
  "uname",
  "whoami",
  "date",
  "ps ",
  "which ",
  "whereis ",
  "env",
  "printenv",
  "bun test",
  "bun run test",
  "bun run typecheck",
  "bun run lint",
  "bun run build",
  "npm test",
  "npm run test",
  "npm run typecheck",
  "npm run lint",
  "npm run build",
];

const REMOTE_EXECUTION_APPROVAL_RULES: Array<{
  pattern: RegExp;
  reason: string;
}> = [
  {
    pattern: /(^|\s)(sudo|doas)\b/u,
    reason: "uses elevated privileges",
  },
  {
    pattern: /(^|\s)rm\b/u,
    reason: "can delete files",
  },
  {
    pattern: /(^|\s)(mv|cp)\b/u,
    reason: "can overwrite project files",
  },
  {
    pattern: /(^|\s)(chmod|chown|chgrp)\b/u,
    reason: "can change file permissions or ownership",
  },
  {
    pattern: /(^|\s)(kill|pkill|killall)\b/u,
    reason: "can terminate running processes",
  },
  {
    pattern:
      /(^|\s)(reboot|shutdown|halt|launchctl|systemctl|scutil|diskutil|dd|mkfs|mount|umount)\b/u,
    reason: "can change host-level system state",
  },
  {
    pattern:
      /\bgit\s+(reset|clean|checkout|switch|restore|rebase|push|cherry-pick|am|apply|commit)\b/u,
    reason: "can rewrite git state or publish changes",
  },
  {
    pattern:
      /\b(bun|npm|pnpm|yarn|uv|pip|pip3|poetry|cargo|go|brew)\s+(add|install|remove|uninstall|update|upgrade|publish)\b/u,
    reason: "can mutate dependencies, environments, or publish artifacts",
  },
  {
    pattern: /(^|\s)(>|>>|1>|2>|&>)/u,
    reason: "writes command output to files",
  },
  {
    pattern: /\|\s*(bash|sh|zsh|fish)\b/u,
    reason: "pipes output directly into a shell",
  },
  {
    pattern: /\b(sed|perl)\s+-i\b/u,
    reason: "edits files in place",
  },
  {
    pattern: /\btee\b/u,
    reason: "can write command output into files",
  },
];

function nowIso(): string {
  return new Date().toISOString();
}

function storeSessionMessage(
  context: AgentExecutionContext,
  input: {
    sessionId: string;
    roomId: string;
    entityId: string;
    role: "user" | "assistant" | "system";
    text: string;
  },
): void {
  context.services.sessions.storeMessage({
    id: randomUUID(),
    sessionId: input.sessionId,
    roomId: input.roomId,
    entityId: input.entityId,
    role: input.role,
    text: input.text,
    createdAt: nowIso(),
  });
}

function scheduleBackgroundTask(task: () => void | Promise<void>): void {
  const timer = setTimeout(() => {
    void Promise.resolve()
      .then(task)
      .catch(() => undefined);
  }, 0);
  timer.unref?.();
}

class TurnPerfTrace {
  private readonly enabled =
    process.env.ELIZA_AGENT_PERF_TRACE === "1" ||
    process.env.ELIZA_AGENT_PERF_TRACE === "true";
  private readonly startedAt = performance.now();
  private lastMark = this.startedAt;
  private readonly spans: Array<{ phase: string; ms: number }> = [];

  mark(phase: string): void {
    if (!this.enabled) {
      return;
    }
    const now = performance.now();
    this.spans.push({
      phase,
      ms: Math.round((now - this.lastMark) * 100) / 100,
    });
    this.lastMark = now;
  }

  flush(
    logger: AgentExecutionContext["runtime"]["logger"] | undefined,
    metadata: Record<string, unknown>,
  ): void {
    if (!this.enabled || !logger) {
      return;
    }
    logger.info(
      {
        ...metadata,
        totalMs: Math.round((performance.now() - this.startedAt) * 100) / 100,
        spans: this.spans,
      },
      "Agent turn performance trace",
    );
  }
}

const providerReadinessCache = new WeakMap<
  object,
  Map<string, { expiresAt: number; message?: string }>
>();
const ensuredConnectionCache = new WeakMap<object, Set<string>>();
const ensuredParticipantCache = new WeakMap<object, Set<string>>();

function shouldUseInformationalResponseCache(input: {
  localInteractive: boolean;
  classification: ReturnType<typeof classifyTurnMessage>;
  policy: ReturnType<typeof deriveTurnExecutionPolicy>;
}): boolean {
  return (
    input.localInteractive &&
    !input.classification.likelyLocalTask &&
    !input.classification.requiresFullContext &&
    input.classification.informationalOnly &&
    !input.classification.actionOriented &&
    !input.policy.useMultiStep &&
    input.policy.maxIterations <= 1
  );
}

function buildInformationalResponseCacheKey(input: {
  sessionId: string;
  provider: string;
  model: string;
  personalityId?: string;
  message: string;
}): string {
  return createHash("sha256")
    .update(
      [
        input.sessionId,
        input.provider,
        input.model,
        input.personalityId ?? "",
        input.message.trim(),
      ].join("\n"),
    )
    .digest("hex");
}

function readInformationalResponseCache(key: string): string | undefined {
  const cached = informationalResponseCache.get(key);
  if (!cached) {
    return undefined;
  }
  if (cached.expiresAt <= Date.now()) {
    informationalResponseCache.delete(key);
    return undefined;
  }
  return cached.text;
}

function writeInformationalResponseCache(key: string, text: string): void {
  informationalResponseCache.set(key, {
    expiresAt: Date.now() + INFORMATIONAL_RESPONSE_CACHE_TTL_MS,
    text,
  });

  if (informationalResponseCache.size <= 128) {
    return;
  }
  for (const [entryKey, value] of informationalResponseCache.entries()) {
    if (value.expiresAt <= Date.now()) {
      informationalResponseCache.delete(entryKey);
    }
    if (informationalResponseCache.size <= 96) {
      break;
    }
  }
}

function buildCodingContextPrelude(input: {
  taskDescription: string;
  sessionId: string;
  workspaceRoot: string;
  maxIterations: number;
  context: AgentExecutionContext;
}): string | undefined {
  try {
    const codingContext = getEffectiveCodingAgentContext(
      input.context.runtime,
      input.context.services,
      {
        sessionId: input.sessionId,
        taskDescription: input.taskDescription,
        workspaceRoot: input.workspaceRoot,
        maxIterations: input.maxIterations,
        interactionMode: "human-in-the-loop",
        metadata: {
          provider: input.context.services.settings.get().model.provider,
          source: "interactive-turn",
        },
      },
    );

    return [
      "CODING CONTEXT",
      `task=${codingContext.taskDescription}`,
      `cwd=${codingContext.workingDirectory}`,
      `connector=${codingContext.connector.type}`,
      `mode=${codingContext.interactionMode}`,
      `maxIterations=${codingContext.maxIterations}`,
    ].join("\n");
  } catch {
    return undefined;
  }
}

function buildCapabilityPrelude(input: {
  context: AgentExecutionContext;
  profile: ReturnType<typeof resolveTurnCapabilityProfile>;
}): string | undefined {
  const policy = getEffectiveTurnCapabilityPolicy(
    input.context.runtime,
    input.profile,
  );
  if (policy.profile === "minimal") {
    return [
      "CAPABILITY PROFILE",
      "profile=minimal",
      "Respond like a strong terminal-native teammate: direct, concrete, and natural.",
      "Answer directly first.",
      "Avoid tools, delegation, and broad planning unless the user explicitly asks for execution.",
      "Do not use meta sections like 'What was completed' or offer to do work you should already have done.",
      "Do not narrate that you searched or inspected something unless that detail materially helps the answer.",
    ].join("\n");
  }

  const preferred = policy.preferredTools.length
    ? `Prefer: ${policy.preferredTools.join(", ")}`
    : undefined;
  const denied = policy.deniedTools.length
    ? `Avoid: ${policy.deniedTools
        .slice(0, 5)
        .map((entry) => entry.name)
        .join(", ")}`
    : undefined;

  return [
    "CAPABILITY PROFILE",
    `profile=${policy.profile}`,
    "Be direct, useful, and terminal-friendly.",
    "Lead with the answer, not process narration.",
    "Avoid filler, defensive caveats, and meta recap sections unless the user explicitly asks for them.",
    "Do not narrate tool usage unless it helps the user understand the result or next decision.",
    preferred,
    denied,
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Context compression helpers
// ---------------------------------------------------------------------------

/**
 * Checks the current session's token usage and, when approaching the context
 * limit, returns a brief human-readable warning to append to the response.
 * Returns undefined when usage is below the warning threshold.
 */
function getContextUsageWarning(
  context: AgentExecutionContext,
  sessionId: string,
): string | undefined {
  try {
    const compression = context.services.contextCompression;
    if (!compression) return undefined;
    const sessionMsgs = context.services.sessions.recentBySession(
      sessionId,
      200,
    );
    if (sessionMsgs.length < 4) return undefined;
    if (
      compression.isApproachingLimit(
        sessionMsgs as Parameters<typeof compression.isApproachingLimit>[0],
        0.75,
      )
    ) {
      const stats = compression.measure(
        sessionMsgs as Parameters<typeof compression.measure>[0],
      );
      const pct = Math.round(stats.usageFraction * 100);
      if (pct >= 85) {
        return `\n\n⚠️ Context window at ${pct}% capacity (~${stats.estimatedTokens.toLocaleString()} tokens). Earlier turns may be summarized soon to preserve context.`;
      }
      if (pct >= 75) {
        return `\n\n💡 Context window at ${pct}% — consider starting a new session for unrelated tasks.`;
      }
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function buildSimpleGreetingReply(message: string): string {
  const normalized = message.trim().toLowerCase();
  if (normalized.startsWith("yo")) {
    return "Yo. What do you want to work on?";
  }
  if (normalized.startsWith("howdy")) {
    return "Howdy. What can I help you with?";
  }
  return "Hey! What can I help you with?";
}

// How many turns between automatic skill-synthesis nudges (prevents spamming)
const SKILL_SYNTHESIS_NUDGE_INTERVAL = 12;

/**
 * Checks whether the completed conversation warrants a skill synthesis nudge
 * and returns the nudge text, or undefined if not applicable.
 *
 * A nudge is only emitted every SKILL_SYNTHESIS_NUDGE_INTERVAL turns and only
 * when the conversation analysis returns `shouldSynthesize: true`.
 */
function maybeGetSkillSynthesisNudge(
  context: AgentExecutionContext,
  sessionId: string,
  turnCount: number,
): string | undefined {
  try {
    // Only check on every Nth turn
    if (turnCount % SKILL_SYNTHESIS_NUDGE_INTERVAL !== 0) return undefined;

    const sessionMsgs = context.services.sessions.recentBySession(
      sessionId,
      100,
    );
    if (sessionMsgs.length < 6) return undefined;

    const analysis = context.services.skillSynthesis.analyzeConversation(
      sessionMsgs as Parameters<
        typeof context.services.skillSynthesis.analyzeConversation
      >[0],
    );

    if (!analysis.shouldSynthesize || !analysis.candidate) return undefined;

    return (
      `\n\n💡 **Skill synthesis available**: This conversation contains a reusable workflow — ` +
      `"${analysis.candidate.title}". ` +
      `Run \`/skills synthesize\` to save it as a skill document, or I can do it automatically.`
    );
  } catch {
    return undefined;
  }
}

function displayCommand(command: string): string {
  return normalizeSlashCommandSyntax(command);
}

function formatShellCommandResponse(result: {
  command: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  durationMs?: number;
}): string {
  return [
    `Command: ${sanitizeTerminalText(result.command, {
      preserveNewlines: false,
      collapseWhitespace: true,
    })}`,
    result.exitCode !== undefined ? `Exit: ${result.exitCode}` : undefined,
    result.durationMs !== undefined
      ? `Duration: ${result.durationMs}ms`
      : undefined,
    `STDOUT:\n${sanitizeTerminalText(result.stdout || "(empty)")}`,
    `STDERR:\n${sanitizeTerminalText(result.stderr || "(empty)")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function runShellCommandForTurn(
  command: string,
  context: AgentExecutionContext,
  hooks?: AgentTurnHooks,
): Promise<{
  command: string;
  exitCode: number;
  stdout?: string;
  stderr?: string;
  durationMs?: number;
}> {
  const backend = context.services.settings.get().execution.backend;
  if (backend === "local" && hooks?.onResponseProgress) {
    let stdout = "";
    let stderr = "";
    const emit = async (chunk: string) => {
      await hooks.onResponseProgress?.({
        chunk,
        response: formatShellCommandResponse({
          command,
          stdout,
          stderr,
        }),
        phase: "command",
      });
    };
    const result = await context.services.terminal.runStreamingLocal(
      command,
      {
        onStdout: (chunk) => {
          stdout += chunk;
          void emit(chunk);
        },
        onStderr: (chunk) => {
          stderr += chunk;
          void emit(chunk);
        },
      },
      undefined,
      hooks?.abortSignal,
    );
    return {
      command: result.command,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs: result.durationMs,
    };
  }

  return (await runEffectiveShellCommand(
    context.runtime,
    context.services,
    command,
  )) as {
    command: string;
    exitCode: number;
    stdout?: string;
    stderr?: string;
    durationMs?: number;
  };
}

function resolveRemoteExecutionPlatform(
  source?: string,
): PlatformName | undefined {
  if (!source) {
    return undefined;
  }
  return REMOTE_EXECUTION_PLATFORMS.has(source as PlatformName)
    ? (source as PlatformName)
    : undefined;
}

function getExecutionApprovalReason(command: string): string | undefined {
  const normalized = command.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (
    SAFE_REMOTE_EXECUTION_PREFIXES.some(
      (prefix) => normalized === prefix || normalized.startsWith(`${prefix} `),
    )
  ) {
    return undefined;
  }
  for (const rule of REMOTE_EXECUTION_APPROVAL_RULES) {
    if (rule.pattern.test(normalized)) {
      return rule.reason;
    }
  }
  return undefined;
}

function formatExecutionApprovalPrompt(input: {
  id: string;
  command: string;
  reason: string;
}): string {
  return [
    "Remote execution approval required before I run that shell command.",
    `Approval: ${input.id}`,
    `Reason: ${input.reason}`,
    `Command: ${input.command}`,
    `Approve and run: ${displayCommand(`/approve ${input.id}`)}`,
    `Deny: ${displayCommand(`/deny ${input.id}`)}`,
    `Review pending: ${displayCommand("/approvals")}`,
  ].join("\n");
}

function isApprovalScopedToRequester(
  input: ChatTurnRequest,
  record: {
    platform: PlatformName;
    userId: string;
    roomId: string;
  },
): boolean {
  const source = resolveRemoteExecutionPlatform(input.source);
  if (!source) {
    return true;
  }
  const sessionKey = input.roomId ?? `room:${input.userId}`;
  return (
    record.platform === source &&
    record.userId === input.userId &&
    record.roomId === sessionKey
  );
}

async function maybeRequireRemoteExecutionApproval(
  input: ChatTurnRequest,
  context: AgentExecutionContext,
  command: string,
  hooks?: AgentTurnHooks,
): Promise<string | undefined> {
  const platform = resolveRemoteExecutionPlatform(input.source);
  const reason = getExecutionApprovalReason(command);
  if (!platform || !reason) {
    return undefined;
  }

  const roomId = input.roomId ?? `room:${input.userId}`;
  const agentName = context.runtime.character?.name ?? "Eliza Agent";
  const runtimeRoomId =
    (input.source ?? "cli") === "cli"
      ? stableRuntimeUuid(`${agentName}-chat-room`)
      : stableRuntimeUuid(roomId);
  const runtimeEntityId = stableRuntimeUuid(input.userId);
  const approval =
    context.services.executionApprovals.useApproved({
      platform,
      userId: input.userId,
      roomId,
      command,
    }) ?? undefined;
  if (approval) {
    return undefined;
  }

  const pending =
    context.services.executionApprovals.findPending({
      platform,
      userId: input.userId,
      roomId,
      command,
    }) ??
    (await context.services.executionApprovals.request({
      platform,
      userId: input.userId,
      roomId,
      sessionKey: roomId,
      runtimeRoomId: String(runtimeRoomId),
      runtimeEntityId: String(runtimeEntityId),
      command,
      reason,
    }));
  const prompt = formatExecutionApprovalPrompt({
    id: pending.id,
    command,
    reason: pending.reason,
  });
  await hooks?.onResponseProgress?.({
    chunk: prompt,
    response: prompt,
    phase: "command",
  });
  return prompt;
}

function formatExecutionApprovalList(
  approvals: Array<{
    id: string;
    status: string;
    platform: string;
    userId: string;
    roomId: string;
    command: string;
    reason: string;
    createdAt: string;
    expiresAt: string;
  }>,
): string {
  if (!approvals.length) {
    return "No execution approvals recorded.";
  }
  return approvals
    .map(
      (record) =>
        `- ${record.id} [${record.status}] ${record.platform} user=${record.userId} room=${record.roomId}\n  reason=${record.reason}\n  command=${record.command}\n  created=${record.createdAt} expires=${record.expiresAt}`,
    )
    .join("\n\n");
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
  const task = createEffectiveDelegationTask(
    context.runtime,
    context.services,
    {
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
    },
  ) as { id: string };
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

function getRunPolicy(context: AgentExecutionContext): {
  runDepth: RunDepth;
  maxIterations: number;
  toolProgressMode: ToolProgressMode;
} {
  const agent = context.services.settings.get().agent;
  return {
    runDepth: agent.runDepth,
    maxIterations: agent.maxIterations,
    toolProgressMode: agent.toolProgressMode,
  };
}

function formatRunPolicy(
  runDepth: RunDepth,
  maxIterations: number,
  toolProgressMode: ToolProgressMode,
): string {
  return [
    `runDepth=${runDepth}`,
    `maxIterations=${maxIterations}`,
    `toolProgress=${toolProgressMode}`,
  ].join("\n");
}

function parseRunDepth(raw: string): RunDepth | undefined {
  return raw === "quick" ||
    raw === "standard" ||
    raw === "deep" ||
    raw === "explore"
    ? raw
    : undefined;
}

function parseToolProgressMode(raw: string): ToolProgressMode | undefined {
  return raw === "off" || raw === "new" || raw === "all" || raw === "verbose"
    ? raw
    : undefined;
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

  context.runtime.setSetting(
    "ELIZAOS_CLOUD_ENABLED",
    provider === "elizacloud" ? "true" : "false",
  );

  if (provider === "elizacloud") {
    const preservedSmallModel =
      context.runtime.getSetting("ELIZAOS_CLOUD_SMALL_MODEL") ||
      context.config.elizaCloudSmallModel;
    context.runtime.setSetting(
      "ELIZAOS_CLOUD_SMALL_MODEL",
      String(preservedSmallModel),
    );
    context.runtime.setSetting("ELIZAOS_CLOUD_LARGE_MODEL", model);
    context.runtime.setSetting(
      "ELIZAOS_CLOUD_BASE_URL",
      normalizeElizaCloudBaseUrl(baseUrl),
    );
    return;
  }

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

export type LinkedProviderName = "elizacloud" | "codex" | "claude-code";

const ELIZA_CLOUD_BILLING_URL =
  "https://www.elizacloud.ai/dashboard/settings?tab=billing";

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
  if (value === "elizacloud" || value === "eliza-cloud" || value === "cloud") {
    return "elizacloud";
  }
  if (value === "claude-code" || value === "claude" || value === "claudecode") {
    return "claude-code";
  }
  return undefined;
}

function defaultProviderModel(
  context: AgentExecutionContext,
  provider: LinkedProviderName,
): string {
  if (provider === "codex") {
    return "gpt-5.4";
  }
  if (provider === "elizacloud") {
    return context.config.elizaCloudLargeModel;
  }
  return "claude-sonnet-4.6";
}

function defaultProviderBaseUrl(provider: LinkedProviderName): string {
  if (provider === "codex") {
    return "https://chatgpt.com/backend-api/codex";
  }
  if (provider === "elizacloud") {
    return resolveCloudApiBaseUrl();
  }
  return "";
}

function normalizeElizaCloudBaseUrl(raw?: string): string {
  return resolveCloudApiBaseUrl(raw || defaultProviderBaseUrl("elizacloud"));
}

async function describeElizaCloudDoctorState(
  context: AgentExecutionContext,
): Promise<{
  configuredBaseUrl: string;
  normalizedBaseUrl: string;
  baseUrlValidation: string | null;
  credentialSource: string;
  authMode: string;
  hasApiKey: boolean;
}> {
  const settings = context.services.settings.get();
  const credentials = await resolveLinkedProviderCredentials("elizacloud");
  const configuredBaseUrl =
    (settings.model.provider === "elizacloud"
      ? settings.model.baseUrl
      : context.config.elizaCloudBaseUrl) ||
    defaultProviderBaseUrl("elizacloud");
  const normalizedBaseUrl = normalizeElizaCloudBaseUrl(
    credentials && "baseUrl" in credentials
      ? credentials.baseUrl || configuredBaseUrl
      : configuredBaseUrl,
  );

  return {
    configuredBaseUrl,
    normalizedBaseUrl,
    baseUrlValidation: await validateCloudBaseUrl(normalizedBaseUrl),
    credentialSource:
      credentials && "source" in credentials && credentials.source?.trim()
        ? credentials.source
        : "missing",
    authMode:
      credentials && "authMode" in credentials && credentials.authMode?.trim()
        ? credentials.authMode
        : "missing",
    hasApiKey: Boolean(
      credentials && "apiKey" in credentials && credentials.apiKey?.trim(),
    ),
  };
}

async function getProviderReadinessMessage(
  context: AgentExecutionContext,
  provider: string,
): Promise<string | undefined> {
  const runtimeKey = context.runtime as object;
  const now = Date.now();
  const cachedReadiness = providerReadinessCache.get(runtimeKey)?.get(provider);
  if (cachedReadiness && cachedReadiness.expiresAt > now) {
    return cachedReadiness.message;
  }
  const snapshot = getLinkedProviderAccountsSnapshot();
  let message: string | undefined;

  if (provider === "offline") {
    message = context.config.offlineBootstrapMode
      ? undefined
      : `No active model provider is configured. Run \`${displayCommand("/accounts")}\` to bind Eliza Cloud, Codex, or Claude Code, or set \`ELIZA_AGENT_OFFLINE_BOOTSTRAP=true\` for explicit bootstrap-only fallback replies.`;
    cacheProviderReadiness(runtimeKey, provider, message);
    return message;
  }

  if (provider === "openai" && !context.config.openAiApiKey?.trim()) {
    if (snapshot.codex.nativeReady || snapshot.codex.reusable) {
      message = [
        "OpenAI is selected, but OPENAI_API_KEY is not configured.",
        "A linked Codex account is ready on this machine.",
        `Run \`${displayCommand("/accounts use codex")}\` to activate it, or add OPENAI_API_KEY and try again.`,
      ].join(" ");
      cacheProviderReadiness(runtimeKey, provider, message);
      return message;
    }
    message = `OpenAI is selected, but OPENAI_API_KEY is not configured. Add it in \`.env\` or run \`${displayCommand("/accounts")}\` to bind a linked provider.`;
    cacheProviderReadiness(runtimeKey, provider, message);
    return message;
  }

  if (provider === "anthropic" && !context.config.anthropicApiKey?.trim()) {
    if (snapshot.claudeCode.nativeReady || snapshot.claudeCode.reusable) {
      return [
        "Anthropic is selected, but ANTHROPIC_API_KEY is not configured.",
        "A linked Claude Code account is ready on this machine.",
        `Run \`${displayCommand("/accounts use claude-code")}\` to activate it, or add ANTHROPIC_API_KEY and try again.`,
      ].join(" ");
    }
    message = `Anthropic is selected, but ANTHROPIC_API_KEY is not configured. Add it in \`.env\` or run \`${displayCommand("/accounts")}\` to bind a linked provider.`;
    cacheProviderReadiness(runtimeKey, provider, message);
    return message;
  }

  if (provider === "elizacloud") {
    const cloudStatus = snapshot.elizaCloud;
    const credentials = await resolveLinkedProviderCredentials("elizacloud");
    const apiKey =
      credentials && "apiKey" in credentials ? credentials.apiKey?.trim() : "";
    if (!apiKey) {
      message =
        cloudStatus.nativeReady || cloudStatus.reusable
          ? `Eliza Cloud is selected, but the managed cloud credentials still look incomplete. Run \`${displayCommand("/accounts connect elizacloud")}\` to refresh the bond, or run \`elizaos login\` again if the local workspace key is stale.`
          : `Eliza Cloud is selected, but no managed cloud key is active in this workspace. Run \`elizaos login\`, then \`${displayCommand("/accounts connect elizacloud")}\` to bind the native cloud path.`;
      cacheProviderReadiness(runtimeKey, provider, message);
      return message;
    }
  }

  if (provider === "codex") {
    const codexStatus = snapshot.codex;
    const credentials = await resolveLinkedProviderCredentials("codex");
    const accessToken =
      credentials && "accessToken" in credentials
        ? credentials.accessToken?.trim()
        : "";
    if (!accessToken) {
      message =
        codexStatus.nativeReady || codexStatus.reusable
          ? `Codex is selected, but the bound credentials still look incomplete. Run \`${displayCommand("/accounts connect codex")}\` to rebind them, or run \`codex login\` first if the local store is stale.`
          : `Codex is selected, but no reusable Codex credentials are available. Run \`codex login\`, then \`${displayCommand("/accounts connect codex")}\` to bind it in Eliza.`;
      cacheProviderReadiness(runtimeKey, provider, message);
      return message;
    }
  }

  if (provider === "claude-code") {
    const claudeStatus = snapshot.claudeCode;
    const credentials = await resolveLinkedProviderCredentials("claude-code");
    const accessToken =
      credentials && "accessToken" in credentials
        ? credentials.accessToken?.trim()
        : "";
    if (!accessToken) {
      if (claudeStatus.fallbackReady) {
        message = `Claude Code is selected, but native Eliza auth material is still missing. Run \`claude setup-token\` to finish the native path, or \`${displayCommand("/accounts connect claude-code")}\` to activate the local Claude CLI fallback right now.`;
        cacheProviderReadiness(runtimeKey, provider, message);
        return message;
      }
      message = `Claude Code is selected, but no native Claude Code credentials are available. Run \`claude auth login\` or \`claude setup-token\`, then \`${displayCommand("/accounts connect claude-code")}\` to bind it in Eliza.`;
      cacheProviderReadiness(runtimeKey, provider, message);
      return message;
    }
  }

  cacheProviderReadiness(runtimeKey, provider, undefined);
  return undefined;
}

function cacheProviderReadiness(
  runtimeKey: object,
  provider: string,
  message: string | undefined,
): void {
  const cache = providerReadinessCache.get(runtimeKey) ?? new Map();
  cache.set(provider, {
    expiresAt: Date.now() + 3_000,
    message,
  });
  providerReadinessCache.set(runtimeKey, cache);
}

async function ensureTurnConnection(
  context: AgentExecutionContext,
  input: Parameters<typeof context.runtime.ensureConnection>[0],
): Promise<void> {
  const runtimeKey = context.runtime as object;
  const connectionKey = [
    input.entityId,
    input.roomId,
    input.worldId,
    input.source,
    input.channelId,
    input.messageServerId,
  ].join(":");
  const ensuredConnections =
    ensuredConnectionCache.get(runtimeKey) ?? new Set<string>();
  if (!ensuredConnections.has(connectionKey)) {
    await context.runtime.ensureConnection(input);
    ensuredConnections.add(connectionKey);
    ensuredConnectionCache.set(runtimeKey, ensuredConnections);
  }

  if (typeof context.runtime.ensureParticipantInRoom !== "function") {
    return;
  }

  const participantKey = `${context.runtime.agentId}:${String(input.roomId)}`;
  const ensuredParticipants =
    ensuredParticipantCache.get(runtimeKey) ?? new Set<string>();
  if (ensuredParticipants.has(participantKey)) {
    return;
  }
  await context.runtime.ensureParticipantInRoom(
    context.runtime.agentId as UUID,
    input.roomId as UUID,
  );
  ensuredParticipants.add(participantKey);
  ensuredParticipantCache.set(runtimeKey, ensuredParticipants);
}

function buildProviderNoResponseMessage(
  provider: string,
  model: string,
): string {
  if (provider === "elizacloud") {
    return `I couldn't get a usable response from Eliza Cloud (${model}). Run \`${displayCommand("/accounts doctor")}\` to verify the cloud bond, then \`${displayCommand("/accounts connect elizacloud")}\` if the workspace needs a fresh Cloud activation.`;
  }
  if (provider === "codex") {
    return `I couldn't get a usable response from Codex (${model}). Run \`${displayCommand("/accounts doctor")}\` to verify the linked account, then \`${displayCommand("/accounts connect codex")}\` if it needs a rebind.`;
  }
  if (provider === "claude-code") {
    return `I couldn't get a usable response from Claude Code (${model}). Run \`${displayCommand("/accounts doctor")}\` to verify the linked account, then \`${displayCommand("/accounts connect claude-code")}\` if it needs a rebind.`;
  }
  if (provider === "openai") {
    return `I couldn't get a usable response from OpenAI (${model}). Check \`OPENAI_API_KEY\` or switch to a linked provider with \`${displayCommand("/accounts")}\`.`;
  }
  if (provider === "anthropic") {
    return `I couldn't get a usable response from Anthropic (${model}). Check \`ANTHROPIC_API_KEY\` or switch to a linked provider with \`${displayCommand("/accounts")}\`.`;
  }
  return `I couldn't get a usable response from the active provider. Run \`${displayCommand("/doctor")}\` or \`${displayCommand("/accounts")}\` to repair the runtime.`;
}

function buildProviderFailureMessage(
  provider: string,
  model: string,
  error: unknown,
  baseUrl?: string,
): string {
  const detail =
    error instanceof Error ? error.message.trim() : String(error).trim();
  const normalized = detail.toLowerCase();
  const cloudBaseUrl = normalizeElizaCloudBaseUrl(baseUrl);

  if (
    normalized.includes("aborted") ||
    normalized.includes("aborterror") ||
    normalized.includes("signal is aborted")
  ) {
    return "The turn was cancelled before the provider finished responding.";
  }

  if (
    normalized.includes("failed query:") &&
    normalized.includes("relationships")
  ) {
    return `The Eliza runtime hit an internal relationships query error while building turn context. Retry the turn after startup finishes, and run \`${displayCommand("/doctor")}\` if it keeps happening.`;
  }

  if (
    normalized.includes("cannot connect to api") ||
    normalized.includes("unable to connect") ||
    normalized.includes("failedtoopensocket") ||
    normalized.includes("connectionrefused")
  ) {
    if (provider === "elizacloud") {
      return `Eliza Cloud (${model}) is active, but I could not reach the Cloud API at \`${cloudBaseUrl}\`. Check network access and the configured base URL, then run \`${displayCommand("/accounts doctor")}\` for a provider-specific diagnosis.`;
    }
    return `The active provider (${provider}:${model}) could not be reached from this shell. Check network access and provider credentials, then run \`${displayCommand("/accounts doctor")}\`.`;
  }

  if (
    normalized.includes("typo in the url or port") ||
    normalized.includes("could not be resolved") ||
    normalized.includes("getaddrinfo") ||
    normalized.includes("dns")
  ) {
    if (provider === "elizacloud") {
      return `Eliza Cloud (${model}) could not resolve the configured API base URL \`${cloudBaseUrl}\`. Compare \`ELIZAOS_CLOUD_BASE_URL\` with the native cloud path, then run \`${displayCommand("/accounts doctor")}\` to verify the normalized URL.`;
    }
    return `The active provider (${provider}:${model}) could not resolve its configured endpoint. Check the base URL/host configuration, then run \`${displayCommand("/accounts doctor")}\`.`;
  }

  if (
    normalized.includes("timed out") ||
    normalized.includes("timeout") ||
    normalized.includes("abortedsignal") ||
    normalized.includes("network timeout")
  ) {
    if (provider === "elizacloud") {
      return `Eliza Cloud (${model}) timed out while waiting for \`${cloudBaseUrl}\`. Check latency or service availability, then run \`${displayCommand("/accounts doctor")}\` if it keeps happening.`;
    }
    return `The active provider (${provider}:${model}) timed out before returning a response.`;
  }

  if (normalized.includes("401") || normalized.includes("unauthorized")) {
    if (provider === "elizacloud") {
      return `Eliza Cloud (${model}) rejected this request as unauthorized. Run \`${displayCommand("/accounts doctor")}\`, then \`${displayCommand("/accounts connect elizacloud")}\` or \`elizaos login\` to refresh the managed bond.`;
    }
    if (provider === "codex" || provider === "claude-code") {
      return `The linked ${provider} session for ${model} is no longer authorized. Run \`${displayCommand(`/accounts connect ${provider}`)}\` after refreshing the local login.`;
    }
  }

  if (normalized.includes("429") || normalized.includes("rate limit")) {
    return `The active provider (${provider}:${model}) is rate-limiting this request right now. Wait a moment or switch models with \`${displayCommand("/accounts")}\`.`;
  }

  if (
    normalized.includes("402") ||
    normalized.includes("payment required") ||
    normalized.includes("insufficient credits") ||
    normalized.includes("insufficient funds")
  ) {
    if (provider === "elizacloud") {
      return `Eliza Cloud (${model}) rejected the request because the managed cloud account is out of credits or billing is blocked. Add credits in ${ELIZA_CLOUD_BILLING_URL} and rerun \`${displayCommand("/accounts doctor")}\` if the shell still reports Cloud auth issues.`;
    }
    return `The active provider (${provider}:${model}) rejected the request because the account is out of credits or billing is blocked.`;
  }

  if (
    normalized.includes("invalid cloud base url") ||
    normalized.includes("must use https") ||
    normalized.includes("blocked local hostname") ||
    normalized.includes("blocked address")
  ) {
    if (provider === "elizacloud") {
      return `Eliza Cloud (${model}) is configured with an invalid base URL: \`${cloudBaseUrl}\`. Run \`${displayCommand("/accounts doctor")}\` and correct \`ELIZAOS_CLOUD_BASE_URL\` before retrying.`;
    }
  }

  if (normalized.includes("no output generated")) {
    return buildProviderNoResponseMessage(provider, model);
  }

  const compactDetail =
    detail.length > 220 ? `${detail.slice(0, 217)}...` : detail;
  return `${buildProviderNoResponseMessage(provider, model)} Last error: ${compactDetail}`;
}

function isRecoverableNativePlanningError(error: unknown): boolean {
  const detail =
    error instanceof Error ? error.message.trim() : String(error).trim();
  const normalized = detail.toLowerCase();

  return [
    "dynamicpromptexecfromstate",
    "dynamic prompt",
    "parse error",
    "failed to parse",
    "unexpected token",
    "json",
  ].some((fragment) => normalized.includes(fragment));
}

function buildNativePlanningFailureMessage(): string {
  return "The native planner hit a local prompt-shaping error on this turn. Try a more explicit command, or rerun with `/doctor` if it keeps happening.";
}

function shouldAttachSystemFacts(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  if (!normalized || normalized.startsWith("/")) {
    return false;
  }
  return [
    "what pc",
    "what computer",
    "what machine",
    "what os",
    "which os",
    "what system",
    "macos",
    "windows",
    "linux",
    "darwin",
    "am i on",
    "use the terminal",
    "can you use the terminal",
    "can you run terminal",
    "what shell",
    "what platform",
  ].some((token) => normalized.includes(token));
}

function buildSystemFactsContext(context: AgentExecutionContext): string {
  const terminalAvailable = "yes";
  const settings = context.services.settings.get();
  return [
    "Live machine facts:",
    `- os=${platform()} ${release()}`,
    `- arch=${arch()}`,
    `- hostname=${hostname()}`,
    `- workspace=${context.config.workspaceDir}`,
    `- shell access=${terminalAvailable} via terminal service and /terminal run`,
    `- execution backend=${settings.execution.backend}`,
    `- provider=${settings.model.provider}`,
    "Use these live facts when answering machine or terminal capability questions. Do not say you cannot inspect the machine when local terminal access is available.",
  ].join("\n");
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
      : defaultProviderModel(context, provider);
  const nextBaseUrl =
    settings.model.provider === provider
      ? settings.model.baseUrl
      : defaultProviderBaseUrl(provider);
  const normalizedBaseUrl =
    provider === "elizacloud"
      ? normalizeElizaCloudBaseUrl(nextBaseUrl)
      : nextBaseUrl;

  context.services.settings.set("model.provider", provider);
  context.services.settings.set("model.model", nextModel);
  context.services.settings.set("model.baseUrl", normalizedBaseUrl);
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
  const status =
    provider === "codex"
      ? accounts.codex
      : provider === "claude-code"
        ? accounts.claudeCode
        : accounts.elizaCloud;
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

function formatLinkedAccountSummary(
  provider: LinkedProviderName,
  snapshot: ReturnType<typeof getLinkedProviderAccountsSnapshot>,
): string {
  const status =
    provider === "codex"
      ? snapshot.codex
      : provider === "claude-code"
        ? snapshot.claudeCode
        : snapshot.elizaCloud;
  return [
    `${provider}`,
    `  nativeReady: ${status.nativeReady ? "yes" : "no"}`,
    `  fallbackReady: ${status.fallbackReady ? "yes" : "no"}`,
    `  reusable: ${status.reusable ? "yes" : "no"}`,
    `  detail: ${status.detail}`,
  ].join("\n");
}

function formatLinkedProviderAdviceNextStep(
  advice: ReturnType<typeof getLinkedProviderConnectAdvice>,
): string {
  if (advice.primaryCommand?.startsWith("/")) {
    return `next: ${displayCommand(advice.primaryCommand)}`;
  }
  return advice.primaryCommand
    ? `next: ${advice.preferredAction} -> ${advice.primaryCommand}`
    : `next: ${advice.preferredAction}`;
}

function formatLinkedProviderAdviceAlternate(
  advice: ReturnType<typeof getLinkedProviderConnectAdvice>,
): string | undefined {
  if (!advice.secondaryCommand) {
    return undefined;
  }
  return advice.secondaryCommand.startsWith("/")
    ? `alternate: ${displayCommand(advice.secondaryCommand)}`
    : `alternate: ${advice.secondaryCommand}`;
}

function formatProviderModeLabel(provider: LinkedProviderName): string {
  if (provider === "elizacloud") {
    return "managed-cloud";
  }
  return "local-specialist";
}

function formatAccountsOverview(
  activeProvider: string,
  accounts: ReturnType<typeof getLinkedProviderAccountsSnapshot>,
): string {
  const elizaCloudAdvice = getLinkedProviderConnectAdvice("elizacloud");
  const codexAdvice = getLinkedProviderConnectAdvice("codex");
  const claudeAdvice = getLinkedProviderConnectAdvice("claude-code");

  const blocks: string[] = [
    `active-provider: ${activeProvider}`,
    "",
    "Managed path",
    `- elizacloud (${formatProviderModeLabel("elizacloud")})`,
    `  nativeReady: ${accounts.elizaCloud.nativeReady ? "yes" : "no"}`,
    `  detail: ${accounts.elizaCloud.detail}`,
    `  ${formatLinkedProviderAdviceNextStep(elizaCloudAdvice)}`,
  ];

  const elizaAlt = formatLinkedProviderAdviceAlternate(elizaCloudAdvice);
  if (elizaAlt) {
    blocks.push(`  ${elizaAlt}`);
  }

  blocks.push(
    "",
    "Local specialist providers",
    `- codex (${formatProviderModeLabel("codex")})`,
    `  nativeReady: ${accounts.codex.nativeReady ? "yes" : "no"}`,
    `  fallbackReady: ${accounts.codex.fallbackReady ? "yes" : "no"}`,
    `  detail: ${accounts.codex.detail}`,
    `  ${formatLinkedProviderAdviceNextStep(codexAdvice)}`,
  );
  const codexAlt = formatLinkedProviderAdviceAlternate(codexAdvice);
  if (codexAlt) {
    blocks.push(`  ${codexAlt}`);
  }

  blocks.push(
    `- claude-code (${formatProviderModeLabel("claude-code")})`,
    `  nativeReady: ${accounts.claudeCode.nativeReady ? "yes" : "no"}`,
    `  fallbackReady: ${accounts.claudeCode.fallbackReady ? "yes" : "no"}`,
    `  detail: ${accounts.claudeCode.detail}`,
    `  ${formatLinkedProviderAdviceNextStep(claudeAdvice)}`,
  );
  const claudeAlt = formatLinkedProviderAdviceAlternate(claudeAdvice);
  if (claudeAlt) {
    blocks.push(`  ${claudeAlt}`);
  }

  return blocks.join("\n");
}

export async function refreshLinkedAccounts(
  provider?: LinkedProviderName | "all",
): Promise<ReturnType<typeof getLinkedProviderAccountsSnapshot>> {
  if (!provider || provider === "all") {
    await Promise.all([
      resolveLinkedProviderCredentials("elizacloud").catch(() => undefined),
      resolveLinkedProviderCredentials("codex").catch(() => undefined),
      resolveLinkedProviderCredentials("claude-code").catch(() => undefined),
      refreshLinkedCodexCredentials().catch(() => undefined),
      refreshLinkedClaudeCodeCredentials().catch(() => undefined),
    ]);
    return getLinkedProviderAccountsSnapshot();
  }

  if (provider === "elizacloud") {
    await resolveLinkedProviderCredentials("elizacloud");
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
  hooks?: AgentTurnHooks,
): Promise<string | undefined> {
  const { message } = input;
  const trimmed = normalizeSlashCommandSyntax(message.trim());
  const sessionKey = input.roomId ?? `room:${input.userId}`;
  const nativeServices = getNativeServices(context.runtime);
  const sourcePlatform = resolveRemoteExecutionPlatform(input.source);

  if (trimmed === "/commands") {
    return renderCommandCatalog(undefined, 80, context.config.workspaceDir);
  }

  if (trimmed.startsWith("/commands search ")) {
    const query = trimmed.replace("/commands search ", "").trim();
    return query
      ? renderCommandCatalog(query, 80, context.config.workspaceDir)
      : "Usage: /commands search <query>";
  }

  if (trimmed === "/approvals" || trimmed === "/approvals list") {
    const approvals = context.services.executionApprovals
      .list()
      .filter((record) =>
        sourcePlatform ? isApprovalScopedToRequester(input, record) : true,
      )
      .slice(0, 20);
    return formatExecutionApprovalList(approvals);
  }

  if (trimmed.startsWith("/approvals list ")) {
    const rawStatus = trimmed.replace("/approvals list ", "").trim();
    const status =
      rawStatus === "pending" ||
      rawStatus === "approved" ||
      rawStatus === "denied" ||
      rawStatus === "used" ||
      rawStatus === "expired"
        ? rawStatus
        : undefined;
    const approvals = context.services.executionApprovals
      .list(status)
      .filter((record) =>
        sourcePlatform ? isApprovalScopedToRequester(input, record) : true,
      )
      .slice(0, 20);
    return formatExecutionApprovalList(approvals);
  }

  if (trimmed.startsWith("/approvals deny ")) {
    const id = trimmed.replace("/approvals deny ", "").trim();
    const record = context.services.executionApprovals.get(id);
    if (!record) {
      return `Execution approval not found: ${id}`;
    }
    if (!isApprovalScopedToRequester(input, record)) {
      return "You can only deny execution approvals for your own remote session.";
    }
    const denied = await context.services.executionApprovals.deny(id);
    return [
      `Denied approval ${denied.id}.`,
      `Command: ${denied.command}`,
      `Reason: ${denied.reason}`,
    ].join("\n");
  }

  if (trimmed.startsWith("/deny ")) {
    const id = trimmed.replace("/deny ", "").trim();
    if (!id) {
      return `Usage: ${displayCommand("/deny <approval-id>")}`;
    }
    return buildCommandResponse(
      {
        ...input,
        message: `/approvals deny ${id}`,
      },
      context,
      hooks,
    );
  }

  if (trimmed.startsWith("/approvals approve ")) {
    const id = trimmed.replace("/approvals approve ", "").trim();
    const record = context.services.executionApprovals.get(id);
    if (!record) {
      return `Execution approval not found: ${id}`;
    }
    if (!isApprovalScopedToRequester(input, record)) {
      return "You can only approve execution requests for your own remote session.";
    }
    const approved = await context.services.executionApprovals.approve(id, {
      useImmediately: true,
    });
    const intro = `Approval ${approved.id} accepted. Executing: ${approved.command}`;
    await hooks?.onResponseProgress?.({
      chunk: intro,
      response: intro,
      phase: "command",
    });
    const result = await runShellCommandForTurn(
      approved.command,
      context,
      hooks,
    );
    return [intro, "", formatShellCommandResponse(result)].join("\n");
  }

  if (trimmed.startsWith("/approve ")) {
    const id = trimmed.replace("/approve ", "").trim();
    if (!id) {
      return `Usage: ${displayCommand("/approve <approval-id>")}`;
    }
    return buildCommandResponse(
      {
        ...input,
        message: `/approvals approve ${id}`,
      },
      context,
      hooks,
    );
  }

  if (trimmed === "/gateway start") {
    if (!context.gateway) {
      return "Gateway runtime is not attached to this execution context.";
    }
    await context.gateway.start();
    return "Gateway started.";
  }

  if (trimmed === "/gateway stop") {
    if (!context.gateway) {
      return "Gateway runtime is not attached to this execution context.";
    }
    await context.gateway.stop();
    return "Gateway stopped.";
  }

  if (trimmed === "/gateway status") {
    if (!context.gateway) {
      return "Gateway runtime is not attached to this execution context.";
    }
    return JSON.stringify(await context.gateway.health(), null, 2);
  }

  if (trimmed === "/responses list") {
    return JSON.stringify(context.services.apiTransport.list(20), null, 2);
  }

  if (trimmed.startsWith("/responses show ")) {
    const id = trimmed.replace("/responses show ", "").trim();
    if (!id) {
      return `Usage: ${displayCommand("/responses show <id>")}`;
    }
    return JSON.stringify(
      context.services.apiTransport.get(id) ?? {
        error: `Response ${id} not found.`,
      },
      null,
      2,
    );
  }

  if (trimmed.startsWith("/pdf extract ")) {
    const path = trimmed.replace("/pdf extract ", "").trim();
    if (!path) {
      return `Usage: ${displayCommand("/pdf extract <path>")}`;
    }
    return context.services.documents.extractPdfFromPath(path);
  }

  if (trimmed.startsWith("/gateway receive ")) {
    if (!context.gateway) {
      return "Gateway runtime is not attached to this execution context.";
    }
    const payload = trimmed.replace("/gateway receive ", "");
    const [head, text] = payload.split("::").map((part) => part.trim());
    const [platform, userId, roomId] = head.split(/\s+/u);
    if (!platform || !userId || !roomId || !text) {
      return `Usage: ${displayCommand("/gateway receive <platform> <userId> <roomId> :: <message>")}`;
    }
    return JSON.stringify(
      await context.gateway.receive({
        platform: platform as never,
        userId,
        roomId,
        text,
      }),
      null,
      2,
    );
  }

  if (trimmed === "/pairing pending") {
    return JSON.stringify(context.services.pairing.listPending(), null, 2);
  }

  if (trimmed.startsWith("/pairing approve ")) {
    const [, , platform, code] = trimmed.split(/\s+/u);
    return JSON.stringify(
      context.services.pairing.approve(platform as never, code),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/pairing deny ")) {
    const [, , platform, code] = trimmed.split(/\s+/u);
    return JSON.stringify(
      context.services.pairing.deny(platform as never, code),
      null,
      2,
    );
  }

  if (trimmed === "/hooks list") {
    return JSON.stringify(context.services.hooks.list(), null, 2);
  }

  if (trimmed.startsWith("/hooks add ")) {
    const payload = trimmed.replace("/hooks add ", "");
    const [head, template] = payload.split("::").map((part) => part.trim());
    const [event, ...nameParts] = head.split(/\s+/u);
    const name = nameParts.join(" ") || event;
    if (!event || !template) {
      return `Usage: ${displayCommand("/hooks add <event> <name?> :: <template>")}`;
    }
    return JSON.stringify(
      context.services.hooks.add({
        event,
        name,
        enabled: true,
        template,
      }),
      null,
      2,
    );
  }

  if (trimmed === "/hooks recent") {
    return JSON.stringify(context.services.hooks.recentInvocations(), null, 2);
  }

  if (trimmed === "/sessions gateway") {
    return JSON.stringify(context.services.gatewaySessions.list(), null, 2);
  }

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
      source?: string;
      commandName?: string;
    }>;
    const summary = getEffectiveSkillsSummary(
      context.runtime,
      context.services,
    ) as {
      total: number;
      workspace?: number;
      generated?: number;
      bundled?: number;
      managed?: number;
      project?: number;
      invocable?: number;
    };
    const workspace = getEffectiveSkillHubWorkspace(context.services) as Array<{
      slug: string;
      title: string;
      description: string;
      source: string;
      manifestPath: string;
    }>;
    const visibleSkills = skills.slice(0, 50);
    return [
      `available=${summary.total} workspace=${summary.workspace ?? workspace.length} generated=${summary.generated ?? getEffectiveSkillHubGenerated(context.services).length} bundled=${summary.bundled ?? 0} managed=${summary.managed ?? 0} project=${summary.project ?? 0} installed=${getEffectiveSkillHubInstalled(context.services).length} invocable=${summary.invocable ?? 0}`,
      "",
      visibleSkills.length
        ? visibleSkills
            .map(
              (skill) =>
                `- ${skill.slug} [${skill.source ?? "workspace"}${skill.commandName ? ` cmd=${skill.commandName}` : ""}]: ${skill.description ?? "No description available."}`,
            )
            .join("\n")
        : "No skills found.",
      skills.length > visibleSkills.length
        ? `\n… ${skills.length - visibleSkills.length} more skill(s). Use /skills summary or /skills show <slug> for deeper detail.`
        : "",
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

  if (trimmed === "/system" || trimmed === "/system facts") {
    return buildSystemFactsContext(context);
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
    return String(
      readEffectiveWorkspaceFile(context.runtime, context.services, path),
    );
  }

  if (trimmed.startsWith("/workspace search ")) {
    const query = trimmed.replace("/workspace search ", "").trim();
    const results = searchEffectiveWorkspace(
      context.runtime,
      context.services,
      query,
      20,
    ) as Array<{
      path: string;
      matches: string[];
    }>;
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
    const writtenPath = writeEffectiveWorkspaceFile(
      context.runtime,
      context.services,
      relativePath,
      content,
    );
    return `Wrote ${writtenPath}.`;
  }

  if (trimmed === "/status") {
    const personality = context.services.personalities.getActive();
    const settings = context.services.settings.get();
    const startup = context.services.startupState.getSnapshot();
    const activeRun = context.services.runController.getActive(
      input.roomId ?? `room:${input.userId}`,
    );
    const autonomous = getAutonomousControlPlane(
      context.runtime,
      context.services,
      context.config,
    );
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
        `Connection: ${autonomous.alignment.connection.kind}${autonomous.alignment.connection.provider ? ` via ${autonomous.alignment.connection.provider}` : ""}`,
        `Run depth: ${settings.agent.runDepth}`,
        `Run cap: ${settings.agent.maxIterations}`,
        `Tool progress: ${settings.agent.toolProgressMode}`,
        `Startup: hotPath=${startup.hotPathReady ? "ready" : "warming"} deferred=${startup.deferredReady ? "ready" : "warming"}`,
        `Hydration: gateway=${startup.phases.gateway.status} cron=${startup.phases.cron.status} diagnostics=${startup.phases.diagnostics.status} operator=${startup.phases.operator.status} skills=${startup.phases.skills.status}`,
        `Fallback: ${context.config.offlineBootstrapMode ? "offline-bootstrap" : "disabled"}`,
        activeRun
          ? `Observed run: ${activeRun.status} steps=${activeRun.observedActionCount}${activeRun.activeAction ? ` active=${activeRun.activeAction}` : ""}`
          : "Observed run: idle",
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
      `Connection: ${autonomous.alignment.connection.kind}${autonomous.alignment.connection.provider ? ` via ${autonomous.alignment.connection.provider}` : ""}`,
      `Run depth: ${settings.agent.runDepth}`,
      `Run cap: ${settings.agent.maxIterations}`,
      `Tool progress: ${settings.agent.toolProgressMode}`,
      `Startup: hotPath=${startup.hotPathReady ? "ready" : "warming"} deferred=${startup.deferredReady ? "ready" : "warming"}`,
      `Hydration: gateway=${startup.phases.gateway.status} cron=${startup.phases.cron.status} diagnostics=${startup.phases.diagnostics.status} operator=${startup.phases.operator.status} skills=${startup.phases.skills.status}`,
      `Fallback: ${context.config.offlineBootstrapMode ? "offline-bootstrap" : "disabled"}`,
      activeRun
        ? `Observed run: ${activeRun.status} steps=${activeRun.observedActionCount}${activeRun.activeAction ? ` active=${activeRun.activeAction}` : ""}`
        : "Observed run: idle",
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

  if (trimmed === "/mode") {
    const policy = getRunPolicy(context);
    return formatRunPolicy(
      policy.runDepth,
      policy.maxIterations,
      policy.toolProgressMode,
    );
  }

  if (trimmed.startsWith("/mode set ")) {
    const nextDepth = parseRunDepth(trimmed.replace("/mode set ", "").trim());
    if (!nextDepth) {
      return `Usage: ${displayCommand("/mode set <quick|standard|deep|explore>")}`;
    }
    const nextCap = RUN_DEPTH_ITERATION_PRESETS[nextDepth];
    context.services.settings.set("agent.runDepth", nextDepth);
    context.services.settings.set("agent.maxIterations", nextCap);
    const policy = getRunPolicy(context);
    return [
      `Run depth updated to ${nextDepth}.`,
      formatRunPolicy(nextDepth, nextCap, policy.toolProgressMode),
    ].join("\n");
  }

  if (trimmed === "/progress") {
    const policy = getRunPolicy(context);
    return formatRunPolicy(
      policy.runDepth,
      policy.maxIterations,
      policy.toolProgressMode,
    );
  }

  if (trimmed.startsWith("/progress set ")) {
    const nextMode = parseToolProgressMode(
      trimmed.replace("/progress set ", "").trim(),
    );
    if (!nextMode) {
      return `Usage: ${displayCommand("/progress set <off|new|all|verbose>")}`;
    }
    context.services.settings.set("agent.toolProgressMode", nextMode);
    const policy = getRunPolicy(context);
    return [
      `Tool progress updated to ${nextMode}.`,
      formatRunPolicy(
        policy.runDepth,
        policy.maxIterations,
        policy.toolProgressMode,
      ),
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
    return formatAccountsOverview(
      context.services.settings.get().model.provider,
      getLinkedProviderAccountsSnapshot(),
    );
  }

  if (trimmed === "/accounts doctor") {
    const accounts = getLinkedProviderAccountsSnapshot();
    const elizaCloudAdvice = getLinkedProviderConnectAdvice("elizacloud");
    const codexAdvice = getLinkedProviderConnectAdvice("codex");
    const claudeAdvice = getLinkedProviderConnectAdvice("claude-code");
    const cloudDoctor = await describeElizaCloudDoctorState(context);
    return [
      "Managed cloud",
      `elizacloud: nativeReady=${accounts.elizaCloud.nativeReady ? "yes" : "no"} fallbackReady=${accounts.elizaCloud.fallbackReady ? "yes" : "no"} available=${accounts.elizaCloud.available ? "yes" : "no"}`,
      `  detail: ${accounts.elizaCloud.detail}`,
      `  cloud: baseUrl=${cloudDoctor.configuredBaseUrl}`,
      `  cloud: normalized=${cloudDoctor.normalizedBaseUrl}`,
      `  cloud: validation=${cloudDoctor.baseUrlValidation ?? "ok"}`,
      `  cloud: auth=${cloudDoctor.authMode} source=${cloudDoctor.credentialSource} apiKey=${cloudDoctor.hasApiKey ? "present" : "missing"}`,
      `  cloud: models fast=${context.config.elizaCloudSmallModel} deep=${context.config.elizaCloudLargeModel}`,
      `  cloud: embeddings model=${context.config.elizaCloudEmbeddingModel} url=${context.config.elizaCloudEmbeddingUrl ?? context.config.elizaCloudBaseUrl}`,
      `  ${formatLinkedProviderAdviceNextStep(elizaCloudAdvice)}`,
      formatLinkedProviderAdviceAlternate(elizaCloudAdvice)
        ? `  ${formatLinkedProviderAdviceAlternate(elizaCloudAdvice)}`
        : "",
      "",
      "Local specialist providers",
      `codex: nativeReady=${accounts.codex.nativeReady ? "yes" : "no"} fallbackReady=${accounts.codex.fallbackReady ? "yes" : "no"} available=${accounts.codex.available ? "yes" : "no"}`,
      `  detail: ${accounts.codex.detail}`,
      `  ${formatLinkedProviderAdviceNextStep(codexAdvice)}`,
      formatLinkedProviderAdviceAlternate(codexAdvice)
        ? `  ${formatLinkedProviderAdviceAlternate(codexAdvice)}`
        : "",
      `claude-code: nativeReady=${accounts.claudeCode.nativeReady ? "yes" : "no"} fallbackReady=${accounts.claudeCode.fallbackReady ? "yes" : "no"} available=${accounts.claudeCode.available ? "yes" : "no"}`,
      `  detail: ${accounts.claudeCode.detail}`,
      `  ${formatLinkedProviderAdviceNextStep(claudeAdvice)}`,
      formatLinkedProviderAdviceAlternate(claudeAdvice)
        ? `  ${formatLinkedProviderAdviceAlternate(claudeAdvice)}`
        : "",
    ].join("\n");
  }

  if (trimmed === "/accounts refresh") {
    const snapshot = await refreshLinkedAccounts("all");
    return [
      "Refreshed linked provider state.",
      "",
      formatLinkedAccountSummary("elizacloud", snapshot),
      "",
      formatLinkedAccountSummary("codex", snapshot),
      "",
      formatLinkedAccountSummary("claude-code", snapshot),
    ].join("\n");
  }

  if (trimmed.startsWith("/accounts refresh ")) {
    const provider = resolveLinkedProviderName(
      trimmed.replace("/accounts refresh ", "").trim(),
    );
    if (!provider) {
      return `Usage: ${displayCommand("/accounts refresh <elizacloud|codex|claude-code>")}`;
    }
    const snapshot = await refreshLinkedAccounts(provider);
    return [
      `Refreshed ${provider}.`,
      "",
      formatLinkedAccountSummary(provider, snapshot),
    ].join("\n");
  }

  if (trimmed.startsWith("/accounts use ")) {
    const provider = resolveLinkedProviderName(
      trimmed.replace("/accounts use ", "").trim(),
    );
    if (!provider) {
      return `Usage: ${displayCommand("/accounts use <elizacloud|codex|claude-code>")}`;
    }
    const activated = activateLinkedProvider(context, provider);
    return [
      provider === "elizacloud"
        ? "Activated Eliza Cloud managed inference."
        : `Activated ${provider} as the local specialist provider.`,
      `model: ${activated.model}`,
      activated.baseUrl
        ? `baseUrl: ${activated.baseUrl}`
        : "baseUrl: provider default",
      "",
      formatLinkedAccountSummary(provider, activated.accounts),
    ].join("\n");
  }

  if (trimmed.startsWith("/accounts connect ")) {
    const provider = resolveLinkedProviderName(
      trimmed.replace("/accounts connect ", "").trim(),
    );
    if (!provider) {
      return `Usage: ${displayCommand("/accounts connect <elizacloud|codex|claude-code>")}`;
    }
    const result = await connectLinkedProvider(context, provider);
    if (result.connected && result.activated && result.providerState) {
      return [
        provider === "elizacloud"
          ? "Eliza Cloud is now connected and active as the managed inference path."
          : `${provider} is now connected and active as a local specialist provider.`,
        `model: ${result.providerState.model}`,
        result.providerState.baseUrl
          ? `baseUrl: ${result.providerState.baseUrl}`
          : "baseUrl: provider default",
        "",
        formatLinkedAccountSummary(provider, result.accounts),
      ].join("\n");
    }
    return [
      `${provider} is not ready to activate yet.`,
      formatLinkedProviderAdviceNextStep(result.advice),
      formatLinkedProviderAdviceAlternate(result.advice) ?? "",
      `detail: ${result.advice.detail}`,
      "",
      formatLinkedAccountSummary(provider, result.accounts),
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (trimmed.startsWith("/accounts login ")) {
    const provider = resolveLinkedProviderName(
      trimmed.replace("/accounts login ", "").trim(),
    );
    if (!provider) {
      return `Usage: ${displayCommand("/accounts login <elizacloud|codex|claude-code>")}`;
    }
    if (hooks?.runLocalShellCommand) {
      return hooks.runLocalShellCommand({
        command: getLinkedProviderLoginCommand(provider),
        afterSuccessConnectProvider: provider,
      });
    }
    const advice = getLinkedProviderConnectAdvice(provider);
    return [
      provider === "elizacloud"
        ? "To activate Eliza Cloud managed mode, run this in your local shell:"
        : `To bind ${provider} as a local specialist provider, run this in your local shell:`,
      `  ${getLinkedProviderLoginCommand(provider)}`,
      `If you're already inside the Eliza Agent shell or cockpit, you can also run: !${getLinkedProviderLoginCommand(provider)}`,
      getLinkedProviderSetupCommand(provider)
        ? `Optional setup-token path: ${getLinkedProviderSetupCommand(provider)}`
        : "",
      `After that, run ${displayCommand(`/accounts connect ${provider}`)} here.`,
      "",
      `detail: ${advice.detail}`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (trimmed.startsWith("/accounts setup-token ")) {
    const provider = resolveLinkedProviderName(
      trimmed.replace("/accounts setup-token ", "").trim(),
    );
    if (provider !== "claude-code") {
      return `Usage: ${displayCommand("/accounts setup-token claude-code")}`;
    }
    const setupCommand = getLinkedProviderSetupCommand(provider);
    if (!setupCommand) {
      return `No setup-token flow is available for ${provider}.`;
    }
    if (hooks?.runLocalShellCommand) {
      return hooks.runLocalShellCommand({
        command: setupCommand,
        afterSuccessConnectProvider: provider,
      });
    }
    const advice = getLinkedProviderConnectAdvice(provider);
    return [
      "To bind Claude Code natively with a setup token, run this in your local shell:",
      `  ${setupCommand}`,
      `From the Eliza Agent shell or cockpit, you can also run: !${setupCommand}`,
      "Then paste the token into onboarding or set CLAUDE_CODE_SETUP_TOKEN / CLAUDE_CODE_OAUTH_TOKEN.",
      `After that, run ${displayCommand("/accounts connect claude-code")} here.`,
      "",
      `detail: ${advice.detail}`,
    ].join("\n");
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
    const skillsSummary = context.services.skills.summary();
    const checks = await context.services.diagnostics.run({
      skillsCount: skillsSummary.total,
      skillsSummary,
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
    const approvalPrompt = await maybeRequireRemoteExecutionApproval(
      input,
      context,
      command,
      hooks,
    );
    if (approvalPrompt) {
      return approvalPrompt;
    }
    const result = await runShellCommandForTurn(command, context, hooks);
    const response = formatShellCommandResponse(result);
    await hooks?.onResponseProgress?.({
      chunk: response,
      response,
      phase: "command",
    });
    return response;
  }

  if (trimmed === "/repo" || trimmed === "/repo status") {
    return String(
      await getEffectiveRepositoryStatus(context.runtime, context.services),
    );
  }

  if (trimmed === "/repo diff") {
    return String(
      await getEffectiveRepositoryDiff(context.runtime, context.services),
    );
  }

  if (trimmed === "/repo log") {
    return String(
      await getEffectiveRepositoryLog(context.runtime, context.services),
    );
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
    const report = await superviseEffectiveDelegationQueue(
      context.runtime,
      context.services,
      async (task) => {
        const completedTask = await runDelegationTaskInWorker(
          context,
          (task as { id: string }).id,
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
        onComplete: async (task: unknown) => {
          context.services.skillSynthesis.synthesizeFromTask(
            task as Parameters<
              typeof context.services.skillSynthesis.synthesizeFromTask
            >[0],
          );
        },
        onError: async (task: unknown, error: string) => {
          context.services.delegation.addNote(
            (task as { id: string }).id,
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
    const child = spawnEffectiveDelegationChild(
      context.runtime,
      context.services,
      parsed.parentId,
      {
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
    const report = await superviseEffectiveDelegationQueue(
      context.runtime,
      context.services,
      async (task) => {
        const completedTask = await runDelegationTaskInWorker(
          context,
          (task as { id: string }).id,
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
        onComplete: async (task: unknown) => {
          context.services.skillSynthesis.synthesizeFromTask(
            task as Parameters<
              typeof context.services.skillSynthesis.synthesizeFromTask
            >[0],
          );
        },
        onError: async (task: unknown, error: string) => {
          context.services.delegation.addNote(
            (task as { id: string }).id,
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
      cancelEffectiveDelegationTask(
        context.runtime,
        context.services,
        id,
        note || "Cancelled by operator.",
      ),
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
    const nativeTrajectory = getNativeServices(
      context.runtime,
    ).trajectoryLogger;
    const nativeExport =
      typeof nativeTrajectory?.exportLatest === "function"
        ? nativeTrajectory.exportLatest()
        : undefined;
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
    const nativeTrajectory = getNativeServices(
      context.runtime,
    ).trajectoryLogger;
    const bundles =
      (typeof nativeTrajectory?.bundles === "function"
        ? (nativeTrajectory.bundles() as Array<{
            label: string;
            createdAt: string;
            messageCount: number;
            sessionCount: number;
            filters?: { sessionId?: string | null; role?: string | null };
            dataPath?: string;
          }>)
        : undefined) ?? context.services.trajectories.listBundles(10);
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
    const nativeTrajectory = getNativeServices(
      context.runtime,
    ).trajectoryLogger;
    const comparison =
      typeof nativeTrajectory?.compareLatest === "function"
        ? nativeTrajectory.compareLatest()
        : context.services.trajectories.compareLatest();
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

export async function executeSlashCommand(
  input: ChatTurnRequest,
  context: AgentExecutionContext,
  hooks?: AgentTurnHooks,
): Promise<string | undefined> {
  return buildCommandResponse(input, context, hooks);
}

interface TurnState {
  agentName: string;
  localInteractive: boolean;
  connectionSource: string;
  sessionId: string;
  roomId: string;
  worldId: string;
  entityId: string;
  messageServerId: string;
  settings: ReturnType<AgentExecutionContext["services"]["settings"]["get"]>;
  runId: string;
}

interface DirectLocalIntentLoader {
  directLocalIntent: unknown;
  executeDirectLocalIntent: (
    intent: never,
    sessionId: string,
    context: AgentExecutionContext,
    hooks?: AgentTurnHooks,
  ) => Promise<string>;
  isHighConfidenceDirectLocalIntent: (intent: never) => boolean;
  shouldUseDirectLocalFallback: (input: {
    message: string;
    response: string;
    observedActionCount: number;
    runFailureMessage?: string;
    isHighConfidenceIntent?: boolean;
  }) => boolean;
}

function createTurnState(
  input: ChatTurnRequest,
  context: AgentExecutionContext,
): TurnState {
  const agentName = context.runtime.character?.name ?? "Eliza Agent";
  const localInteractive = (input.source ?? "cli") === "cli";
  const connectionSource = localInteractive ? "cli" : (input.source ?? "cli");
  const roomKey = input.roomId ?? `room:${input.userId}`;
  const messageServerId = localInteractive
    ? stableRuntimeUuid(`${agentName}-cli-server`)
    : stableRuntimeUuid("eliza-agent-message-server");

  return {
    agentName,
    localInteractive,
    connectionSource,
    sessionId: roomKey,
    roomId: localInteractive
      ? stableRuntimeUuid(`${agentName}-chat-room`)
      : stableRuntimeUuid(roomKey),
    worldId: createUniqueUuid(context.runtime, messageServerId),
    entityId: stableRuntimeUuid(input.userId),
    messageServerId,
    settings: context.services.settings.get(),
    runId: randomUUID(),
  };
}

function createProfileObservationScheduler(
  input: ChatTurnRequest,
  context: AgentExecutionContext,
  sessionId: string,
): () => void {
  return () => {
    scheduleBackgroundTask(() => {
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
    });
  };
}

function startTrackedTurn(
  input: ChatTurnRequest,
  context: AgentExecutionContext,
  turn: TurnState,
  effectiveAgentPolicy?: {
    runDepth: RunDepth;
    maxIterations: number;
    toolProgressMode: ToolProgressMode;
  },
): void {
  storeSessionMessage(context, {
    sessionId: turn.sessionId,
    roomId: turn.roomId,
    entityId: turn.entityId,
    role: "user",
    text: input.message,
  });
  context.services.runController.startTurn({
    sessionId: turn.sessionId,
    roomId: String(turn.roomId),
    runId: turn.runId,
    source: input.source ?? "cli",
    message: input.message,
    runDepth: effectiveAgentPolicy?.runDepth ?? turn.settings.agent.runDepth,
    configuredMaxIterations:
      effectiveAgentPolicy?.maxIterations ?? turn.settings.agent.maxIterations,
    progressMode:
      effectiveAgentPolicy?.toolProgressMode ??
      turn.settings.agent.toolProgressMode,
    pendingApprovals:
      context.services.executionApprovals.latestPendingForSession(
        turn.sessionId,
      )
        ? 1
        : 0,
  });
}

async function ensureLocalInteractiveSettingsState(
  context: AgentExecutionContext,
  turn: TurnState,
): Promise<void> {
  if (!turn.localInteractive) {
    return;
  }

  try {
    const world = await context.runtime.getWorld(turn.worldId as UUID);
    if (!world) {
      return;
    }

    const metadata =
      world.metadata && typeof world.metadata === "object"
        ? world.metadata
        : {};
    const hasSettings =
      "settings" in metadata &&
      metadata.settings &&
      typeof metadata.settings === "object";
    const ownership =
      metadata.ownership && typeof metadata.ownership === "object"
        ? metadata.ownership
        : {};
    const hasOwner =
      "ownerId" in ownership && ownership.ownerId === turn.entityId;
    if (!hasOwner) {
      world.metadata = {
        ...metadata,
        ownership: {
          ...ownership,
          ownerId: turn.entityId,
        },
      };
      await context.runtime.updateWorld(world);
    }
    if (!hasSettings) {
      await initializeOnboarding(context.runtime, world, {
        settings: {},
      });
    }
  } catch {
    // Best effort only; chat should still proceed if local settings bootstrap fails.
  }
}

async function finalizeTurnResponse(
  context: AgentExecutionContext,
  turn: TurnState,
  text: string,
  scheduleProfileObservation: () => void,
  options?: AgentTurnHooks,
  phase: "command" | "readiness" | "model" = "command",
): Promise<string> {
  await options?.onResponseProgress?.({
    chunk: text,
    response: text,
    phase,
  });
  storeSessionMessage(context, {
    sessionId: turn.sessionId,
    roomId: turn.roomId,
    entityId: turn.entityId,
    role: "assistant",
    text,
  });
  context.services.runController.finishTurn(turn.sessionId, "complete");
  scheduleProfileObservation();
  return text;
}

function createDirectLocalIntentLoader(
  input: ChatTurnRequest,
  context: AgentExecutionContext,
): () => Promise<DirectLocalIntentLoader> {
  let loaded = false;
  let directLocalIntent: unknown;
  return async () => {
    const fallbackModule = await import("@/runtime/local-intent-fallback");
    if (!loaded) {
      directLocalIntent = fallbackModule.resolveDirectLocalIntent(
        input,
        context,
      );
      loaded = true;
    }
    return {
      directLocalIntent,
      executeDirectLocalIntent: fallbackModule.executeDirectLocalIntent,
      isHighConfidenceDirectLocalIntent:
        fallbackModule.isHighConfidenceDirectLocalIntent,
      shouldUseDirectLocalFallback: fallbackModule.shouldUseDirectLocalFallback,
    };
  };
}

export async function handleAgentTurn(
  input: ChatTurnRequest,
  context: AgentExecutionContext,
  options?: {
    runtimeOverrides?: CronJobRuntimeOverrides;
    personalityId?: string;
  } & AgentTurnHooks,
): Promise<string> {
  const perf = new TurnPerfTrace();
  const turn = createTurnState(input, context);
  const trimmedMessage = input.message.trim();
  const workflowCommand = trimmedMessage.startsWith("/")
    ? resolveWorkflowCommandPrompt({
        message: trimmedMessage,
        workspaceDir: context.config.workspaceDir,
      })
    : undefined;
  const effectiveInput = workflowCommand
    ? {
        ...input,
        message: workflowCommand.prompt,
      }
    : input;
  const derivedTurnPolicy = deriveTurnExecutionPolicy(
    effectiveInput.message,
    turn.settings.agent,
    {
      localInteractive: turn.localInteractive,
    },
  );
  const scheduleProfileObservation = createProfileObservationScheduler(
    input,
    context,
    turn.sessionId,
  );
  startTrackedTurn(input, context, turn, derivedTurnPolicy);

  const effectiveTrimmedMessage = effectiveInput.message.trim();
  const turnClassification = classifyTurnMessage(effectiveTrimmedMessage);
  const shouldInspectLocalIntent = turn.localInteractive;
  const responseFromCommandLayer =
    !workflowCommand && trimmedMessage.startsWith("/")
      ? await executeSlashCommand(input, context, options)
      : undefined;
  perf.mark("command-layer");

  if (effectiveTrimmedMessage.startsWith("!")) {
    const command = effectiveTrimmedMessage.slice(1).trim();
    if (!command) {
      context.services.runController.finishTurn(turn.sessionId, "complete");
      scheduleProfileObservation();
      perf.flush(context.runtime.logger, {
        path: "shell-usage-error",
        sessionId: turn.sessionId,
        source: input.source ?? "cli",
      });
      return "Usage: !<shell command>";
    }
    const approvalPrompt = await maybeRequireRemoteExecutionApproval(
      input,
      context,
      command,
      options,
    );
    if (approvalPrompt) {
      context.services.runController.setPendingApprovals(turn.sessionId, 1);
      storeSessionMessage(context, {
        sessionId: turn.sessionId,
        roomId: turn.roomId,
        entityId: turn.entityId,
        role: "assistant",
        text: approvalPrompt,
      });
      context.services.runController.finishTurn(turn.sessionId, "complete");
      scheduleProfileObservation();
      perf.flush(context.runtime.logger, {
        path: "shell-approval",
        sessionId: turn.sessionId,
        source: input.source ?? "cli",
      });
      return approvalPrompt;
    }
    const shellAction = `shell:${command}`;
    context.services.runController.noteActionStarted(
      turn.sessionId,
      shellAction,
    );
    let result: Awaited<ReturnType<typeof runShellCommandForTurn>>;
    try {
      result = await runShellCommandForTurn(command, context, options);
    } catch (error) {
      context.services.runController.noteActionCompleted(
        turn.sessionId,
        shellAction,
      );
      context.services.runController.finishTurn(
        turn.sessionId,
        "error",
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
    context.services.runController.noteActionCompleted(
      turn.sessionId,
      shellAction,
    );
    const shellResponse = formatShellCommandResponse(result);
    await finalizeTurnResponse(
      context,
      turn,
      shellResponse,
      scheduleProfileObservation,
      options,
      "command",
    );
    perf.mark("shell-command");
    perf.flush(context.runtime.logger, {
      path: "shell-command",
      sessionId: turn.sessionId,
      source: input.source ?? "cli",
    });
    return shellResponse;
  }

  if (responseFromCommandLayer) {
    await finalizeTurnResponse(
      context,
      turn,
      responseFromCommandLayer,
      scheduleProfileObservation,
      options,
      "command",
    );
    perf.flush(context.runtime.logger, {
      path: "slash-command",
      sessionId: turn.sessionId,
      source: input.source ?? "cli",
    });
    return responseFromCommandLayer;
  }

  if (
    turn.localInteractive &&
    isSimpleGreetingMessage(effectiveInput.message)
  ) {
    const greetingResponse = buildSimpleGreetingReply(effectiveInput.message);
    await finalizeTurnResponse(
      context,
      turn,
      greetingResponse,
      scheduleProfileObservation,
      options,
      "model",
    );
    perf.flush(context.runtime.logger, {
      path: "simple-greeting",
      sessionId: turn.sessionId,
      source: input.source ?? "cli",
    });
    return greetingResponse;
  }

  const loadDirectLocalIntent = createDirectLocalIntentLoader(
    effectiveInput,
    context,
  );

  const executeApprovedDirectLocalIntent = async (
    intent: {
      label?: string;
    },
    pendingNotice?: string,
  ): Promise<string | undefined> => {
    const label = intent.label ?? "";
    if (label.startsWith("shell:")) {
      const command = label.slice("shell:".length).trim();
      const approvalPrompt = await maybeRequireRemoteExecutionApproval(
        input,
        context,
        command,
        options,
      );
      if (approvalPrompt) {
        context.services.runController.setPendingApprovals(turn.sessionId, 1);
        storeSessionMessage(context, {
          sessionId: turn.sessionId,
          roomId: turn.roomId,
          entityId: turn.entityId,
          role: "assistant",
          text: approvalPrompt,
        });
        context.services.runController.finishTurn(turn.sessionId, "complete");
        return approvalPrompt;
      }
    }
    if (pendingNotice) {
      await options?.onNotice?.({
        kind: "status",
        message: pendingNotice,
      });
    }
    return undefined;
  };

  const preferredLocalIntent = shouldInspectLocalIntent
    ? await loadDirectLocalIntent()
    : null;
  if (
    preferredLocalIntent?.directLocalIntent &&
    preferredLocalIntent.isHighConfidenceDirectLocalIntent(
      preferredLocalIntent.directLocalIntent as never,
    )
  ) {
    const approvalResponse = await executeApprovedDirectLocalIntent(
      preferredLocalIntent.directLocalIntent as {
        label?: string;
      },
    );
    if (approvalResponse) {
      return approvalResponse;
    }
    const directResponse = await preferredLocalIntent.executeDirectLocalIntent(
      preferredLocalIntent.directLocalIntent as never,
      turn.sessionId,
      context,
      options,
    );
    storeSessionMessage(context, {
      sessionId: turn.sessionId,
      roomId: turn.roomId,
      entityId: turn.entityId,
      role: "assistant",
      text: directResponse,
    });
    context.services.runController.finishTurn(turn.sessionId, "complete");
    scheduleProfileObservation();
    perf.mark("preferred-local-intent");
    perf.flush(context.runtime.logger, {
      path: "preferred-local-intent",
      sessionId: turn.sessionId,
      source: input.source ?? "cli",
    });
    return directResponse;
  }

  let response = "";
  let deferNativeStreaming = false;
  const personalityBefore = context.services.personalities.getActive();
  const settingsBefore = context.services.settings.get();
  const settingsDuring = applyRuntimeOverrides(
    settingsBefore,
    options?.runtimeOverrides,
  );
  const shouldUseResponseCache = shouldUseInformationalResponseCache({
    localInteractive: turn.localInteractive,
    classification: turnClassification,
    policy: derivedTurnPolicy,
  });
  const responseCacheKey = shouldUseResponseCache
    ? buildInformationalResponseCacheKey({
        sessionId: turn.sessionId,
        provider: settingsDuring.model.provider,
        model: settingsDuring.model.model,
        personalityId: options?.personalityId ?? personalityBefore.id,
        message: effectiveInput.message,
      })
    : undefined;
  if (responseCacheKey) {
    const cachedResponse = readInformationalResponseCache(responseCacheKey);
    if (cachedResponse) {
      await finalizeTurnResponse(
        context,
        turn,
        cachedResponse,
        scheduleProfileObservation,
        options,
        "model",
      );
      perf.flush(context.runtime.logger, {
        path: "informational-response-cache",
        sessionId: turn.sessionId,
        source: input.source ?? "cli",
      });
      return cachedResponse;
    }
  }
  const systemFactsPrelude = shouldAttachSystemFacts(effectiveInput.message)
    ? buildSystemFactsContext(context)
    : undefined;
  const capabilityProfile = resolveTurnCapabilityProfile(
    effectiveInput.message,
    {
      localInteractive: turn.localInteractive,
    },
  );
  const capabilityPrelude = buildCapabilityPrelude({
    context,
    profile: capabilityProfile,
  });
  const codingPrelude =
    turn.localInteractive &&
    turnClassification.likelyLocalTask &&
    turnClassification.actionOriented
      ? buildCodingContextPrelude({
          context,
          sessionId: turn.sessionId,
          taskDescription: effectiveInput.message,
          workspaceRoot: context.config.workspaceDir,
          maxIterations: derivedTurnPolicy.maxIterations,
        })
      : undefined;
  const messagePrelude = [systemFactsPrelude, capabilityPrelude, codingPrelude]
    .filter((value): value is string => Boolean(value?.trim()))
    .join("\n\n");
  const effectiveMessage = messagePrelude
    ? `${messagePrelude}\n\nUser request:\n${effectiveInput.message}`
    : effectiveInput.message;

  const readinessMessage = await getProviderReadinessMessage(
    context,
    settingsDuring.model.provider,
  );
  perf.mark("provider-readiness");
  if (readinessMessage) {
    await finalizeTurnResponse(
      context,
      turn,
      readinessMessage,
      scheduleProfileObservation,
      options,
      "readiness",
    );
    perf.flush(context.runtime.logger, {
      path: "provider-readiness",
      sessionId: turn.sessionId,
      source: input.source ?? "cli",
    });
    return readinessMessage;
  }

  await ensureTurnConnection(context, {
    entityId: turn.entityId as UUID,
    roomId: turn.roomId as UUID,
    worldId: turn.worldId as UUID,
    userName: turn.localInteractive ? "User" : input.userId,
    source: turn.connectionSource,
    channelId: turn.localInteractive
      ? `${turn.agentName}-chat`
      : turn.sessionId,
    messageServerId: turn.messageServerId as UUID,
    type: ChannelType.DM,
    metadata: {
      ownership: {
        ownerId: turn.entityId as UUID,
      },
    },
  } as Parameters<typeof context.runtime.ensureConnection>[0]);
  perf.mark("runtime-connection");
  await ensureLocalInteractiveSettingsState(context, turn);
  perf.mark("local-settings-state");

  const memory = createMessageMemory({
    id: randomUUID() as UUID,
    entityId: turn.entityId as UUID,
    roomId: turn.roomId as UUID,
    content: {
      text: effectiveMessage,
      source: turn.connectionSource,
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
  const previousToolProfile = context.runtime.getSetting(
    "ELIZA_AGENT_TOOL_PROFILE",
  );

  let activeStreamSource: StreamSource = "unset";
  const emitChunk = async (chunk: string): Promise<void> => {
    if (!chunk) {
      return;
    }
    response += chunk;
    if (deferNativeStreaming) {
      return;
    }
    await options?.onResponseProgress?.({
      chunk,
      response,
      phase: "model",
    });
  };
  const emitSnapshot = async (text: string): Promise<void> => {
    if (!text) {
      return;
    }
    response = text;
    if (deferNativeStreaming) {
      return;
    }
    await options?.onResponseProgress?.({
      chunk: text,
      response,
      phase: "model",
    });
  };
  const claimStreamSource = (
    source: Exclude<StreamSource, "unset">,
  ): boolean => {
    if (activeStreamSource === "unset") {
      activeStreamSource = source;
      return true;
    }
    return activeStreamSource === source;
  };
  const appendIncomingText = async (incoming: string): Promise<void> => {
    const update = resolveStreamingUpdate(response, incoming);
    if (update.kind === "noop") {
      return;
    }
    if (update.kind === "append") {
      await emitChunk(update.emittedText);
      return;
    }
    await emitSnapshot(update.nextText);
  };
  try {
    context.runtime.setSetting("ELIZA_AGENT_TOOL_PROFILE", capabilityProfile);
    context.runtime.setSetting(
      "ELIZAOS_CLOUD_CONVERSATION_ID",
      context.services.sessions.continuityKey(turn.sessionId),
    );
    if (typeof context.runtime.emitEvent === "function") {
      await context.runtime.emitEvent(EventType.MESSAGE_RECEIVED, {
        runtime: context.runtime,
        message: memory,
        source: turn.connectionSource,
      });
    }
  } catch (error) {
    context.runtime.logger?.warn(
      { error, roomId: turn.roomId, source: turn.connectionSource },
      "Failed to emit MESSAGE_RECEIVED event for local turn",
    );
  }

  let messageResult:
    | Awaited<
        ReturnType<
          NonNullable<typeof context.runtime.messageService>["handleMessage"]
        >
      >
    | undefined;
  let runFailureMessage: string | undefined;

  try {
    context.services.runController.updateThinking(turn.sessionId);
    try {
      messageResult = await context.runtime.messageService?.handleMessage(
        context.runtime,
        memory,
        async (content) => {
          const chunk = extractCompatTextContent(content);
          if (!chunk || !claimStreamSource("callback")) {
            return [];
          }
          await appendIncomingText(chunk);
          return [];
        },
        {
          useMultiStep: derivedTurnPolicy.useMultiStep,
          maxMultiStepIterations: derivedTurnPolicy.useMultiStep
            ? derivedTurnPolicy.maxIterations
            : 1,
          abortSignal: options?.abortSignal,
          onStreamChunk: options?.onResponseProgress
            ? async (chunk: string) => {
                if (!chunk || !claimStreamSource("onStreamChunk")) {
                  return;
                }
                await appendIncomingText(chunk);
              }
            : undefined,
        },
      );
      perf.mark("native-handle-message");

      if (
        Array.isArray(messageResult?.responseMessages) &&
        typeof context.runtime.emitEvent === "function"
      ) {
        for (const responseMessage of messageResult.responseMessages) {
          const content = (responseMessage as { content?: Content })
            .content ?? {
            text: "",
          };
          const emittedMessage = {
            id:
              (responseMessage as { id?: string }).id ?? (randomUUID() as UUID),
            roomId: memory.roomId,
            entityId: context.runtime.agentId as UUID,
            content,
            metadata: memory.metadata,
          } as typeof memory;
          await context.runtime.emitEvent(EventType.MESSAGE_SENT, {
            runtime: context.runtime,
            message: emittedMessage,
            source: turn.connectionSource,
          });
        }
      }
    } catch (error) {
      const directFallback = isRecoverableNativePlanningError(error)
        ? await loadDirectLocalIntent()
        : undefined;
      if (
        isRecoverableNativePlanningError(error) &&
        directFallback?.directLocalIntent
      ) {
        runFailureMessage =
          error instanceof Error ? error.message.trim() : String(error).trim();
        response = "";
      } else {
        const failureMessage = isRecoverableNativePlanningError(error)
          ? buildNativePlanningFailureMessage()
          : buildProviderFailureMessage(
              settingsDuring.model.provider,
              settingsDuring.model.model,
              error,
              settingsDuring.model.baseUrl,
            );
        context.runtime.logger?.warn(
          {
            error,
            provider: settingsDuring.model.provider,
            model: settingsDuring.model.model,
            roomId: turn.roomId,
          },
          "Local agent turn failed in provider runtime",
        );
        await options?.onNotice?.({
          kind: "status",
          message: failureMessage,
        });
        response = failureMessage;
        runFailureMessage = failureMessage;
      }
    }
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
    context.runtime.setSetting(
      "ELIZA_AGENT_TOOL_PROFILE",
      typeof previousToolProfile === "string" ? previousToolProfile : null,
    );
  }

  const observedActionCount =
    context.services.runController.getActive(turn.sessionId)
      ?.observedActionCount ?? 0;

  const fallbackModule =
    shouldInspectLocalIntent && (observedActionCount === 0 || runFailureMessage)
      ? await loadDirectLocalIntent()
      : null;

  if (
    fallbackModule?.directLocalIntent &&
    fallbackModule.shouldUseDirectLocalFallback({
      message: effectiveInput.message,
      response,
      observedActionCount,
      runFailureMessage,
      isHighConfidenceIntent: fallbackModule.isHighConfidenceDirectLocalIntent(
        fallbackModule.directLocalIntent as never,
      ),
    })
  ) {
    try {
      deferNativeStreaming = false;
      const approvalResponse = await executeApprovedDirectLocalIntent(
        fallbackModule.directLocalIntent as {
          label?: string;
        },
        runFailureMessage || response.trim()
          ? "Native planning stalled on this local task, so I switched to the direct workspace executor."
          : undefined,
      );
      if (approvalResponse) {
        return approvalResponse;
      }
      response = await fallbackModule.executeDirectLocalIntent(
        fallbackModule.directLocalIntent as never,
        turn.sessionId,
        context,
        options,
      );
      runFailureMessage = undefined;
      deferNativeStreaming = false;
      perf.mark("fallback-local-intent");
    } catch (fallbackError) {
      if (!runFailureMessage) {
        context.services.runController.finishTurn(
          turn.sessionId,
          "error",
          fallbackError instanceof Error
            ? fallbackError.message
            : String(fallbackError),
        );
        throw fallbackError;
      }
    }
  } else if (deferNativeStreaming && response.trim()) {
    deferNativeStreaming = false;
    await options?.onResponseProgress?.({
      chunk: response,
      response,
      phase: "model",
    });
  }

  const normalizedResponse = response.trim();
  const baseResponse =
    runFailureMessage &&
    observedActionCount === 0 &&
    isSimpleGreetingMessage(effectiveInput.message)
      ? buildSimpleGreetingReply(effectiveInput.message)
      : normalizedResponse ||
        buildProviderNoResponseMessage(
          settingsDuring.model.provider,
          settingsDuring.model.model,
        );

  // -------------------------------------------------------------------
  // Post-response enhancements
  // -------------------------------------------------------------------

  // Count assistant turns in this session to throttle nudges
  const sessionTurnCount = context.services.sessions.countBySessionRole(
    turn.sessionId,
    "assistant",
  );

  // Context window usage warning (only for interactive sources)
  const usageWarning = turn.localInteractive
    ? getContextUsageWarning(context, turn.sessionId)
    : undefined;

  // Skill synthesis nudge (only for interactive/non-cron sources)
  const skillNudge =
    turn.localInteractive && (input.source ?? "cli") !== "cron"
      ? maybeGetSkillSynthesisNudge(context, turn.sessionId, sessionTurnCount)
      : undefined;
  if (usageWarning) {
    await options?.onNotice?.({
      kind: "context",
      message: usageWarning.trim(),
    });
  }
  if (skillNudge) {
    await options?.onNotice?.({
      kind: "skills",
      message: skillNudge.trim(),
    });
  }

  const finalResponse = baseResponse;

  if (
    responseCacheKey &&
    !runFailureMessage &&
    observedActionCount === 0 &&
    finalResponse.trim()
  ) {
    writeInformationalResponseCache(responseCacheKey, finalResponse);
  }

  storeSessionMessage(context, {
    sessionId: turn.sessionId,
    roomId: turn.roomId,
    entityId: turn.entityId,
    role: "assistant",
    text: finalResponse,
  });

  context.services.runController.finishTurn(
    turn.sessionId,
    runFailureMessage ? "error" : "complete",
    runFailureMessage,
  );
  scheduleProfileObservation();
  perf.mark("post-response");
  perf.flush(context.runtime.logger, {
    path: runFailureMessage ? "native-error" : "native-response",
    sessionId: turn.sessionId,
    source: input.source ?? "cli",
    observedActionCount,
  });

  return finalResponse;
}

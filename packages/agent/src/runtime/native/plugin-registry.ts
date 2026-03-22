import type { Plugin } from "@elizaos/core";
import { actionBenchPlugin } from "@elizaos/plugin-action-bench";
import { createAgentOrchestratorPlugin } from "@elizaos/plugin-agent-orchestrator";
import { createAgentSkillsPlugin } from "@elizaos/plugin-agent-skills";
import anthropicPlugin from "@elizaos/plugin-anthropic";
import { createAutocoderPlugin } from "@elizaos/plugin-autocoder";
import { createBrowserPlugin } from "@elizaos/plugin-browser";
import { createClaudeCodePlugin } from "@elizaos/plugin-claude-code";
import { createCodexPlugin } from "@elizaos/plugin-codex";
import { createCodingAgentPlugin } from "@elizaos/plugin-coding-agent";
import { createDiscordPlugin } from "@elizaos/plugin-discord";
import { e2bPlugin } from "@elizaos/plugin-e2b";
import { createExperiencePlugin } from "@elizaos/plugin-experience";
import formsPlugin from "@elizaos/plugin-forms";
import { createKnowledgePlugin } from "@elizaos/plugin-knowledge";
import { createLocalEmbeddingPlugin } from "@elizaos/plugin-local-embedding";
import { openaiPlugin } from "@elizaos/plugin-openai";
import { pdfPlugin } from "@elizaos/plugin-pdf";
import { createPlanningPlugin } from "@elizaos/plugin-planning";
import { createPluginManagerPlugin } from "@elizaos/plugin-plugin-manager";
import { createRolodexPlugin } from "@elizaos/plugin-rolodex";
import sqlPlugin from "@elizaos/plugin-sql";
import telegramPlugin from "@elizaos/plugin-telegram";
import { TTSGenerationPlugin } from "@elizaos/plugin-tts";
import { createElizaAgentPlugin } from "@plugins/eliza-agent-plugin";
import type { AppServices } from "@/services";
import type { EnvConfig, MemoryTarget } from "@/types";
import {
  getLinkedClaudeCodeCredentials,
  getLinkedCodexCredentials,
  getLinkedProviderAccountsSnapshot,
  refreshLinkedClaudeCodeCredentials,
  refreshLinkedCodexCredentials,
} from "./account-auth";
import {
  getNativePluginCatalog,
  groupNativePluginCatalog,
} from "./plugin-catalog";
import {
  createNativeCronServicePlugin,
  createNativeMcpServicePlugin,
  createNativePersonalityServicePlugin,
  createNativeShellServicePlugin,
  createNativeTrajectoryLoggerServicePlugin,
} from "./service-plugins";

export interface NativePluginAssembly {
  catalog: ReturnType<typeof getNativePluginCatalog>;
  groupedCatalog: ReturnType<typeof groupNativePluginCatalog>;
  foundation: Plugin[];
  providers: Plugin[];
  messaging: Plugin[];
  knowledge: Plugin[];
  browser: Plugin[];
  media: Plugin[];
  research: Plugin[];
  execution: Plugin[];
  integration: Plugin[];
  automation: Plugin[];
  product: Plugin[];
  all: Plugin[];
}

function hasOfficialModelProvider(config: EnvConfig): boolean {
  return Boolean(config.openAiApiKey || config.anthropicApiKey);
}

function normalizePlugin(plugin: unknown): Plugin {
  return plugin as Plugin;
}

function normalizeMetadata(
  metadata?: Record<string, unknown>,
): Record<string, string> | undefined {
  if (!metadata) {
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [key, String(value)]),
  );
}

export function buildNativePluginAssembly(
  services: AppServices,
  config: EnvConfig,
): NativePluginAssembly {
  const selectedProvider = services.settings.get().model.provider;
  const catalog = getNativePluginCatalog(config);
  const groupedCatalog = groupNativePluginCatalog(catalog);

  const foundation: Plugin[] = [];
  const providers: Plugin[] = [
    normalizePlugin(sqlPlugin),
    normalizePlugin(pdfPlugin),
    createCodexPlugin({
      enabled: selectedProvider === "codex",
      getStatus: () => getLinkedProviderAccountsSnapshot().codex,
      getCredentials: () => getLinkedCodexCredentials(),
      refreshCredentials: () => refreshLinkedCodexCredentials(),
    }),
    createClaudeCodePlugin({
      enabled: selectedProvider === "claude-code",
      allowCliFallback: config.claudeCodeCliFallback,
      getStatus: () => getLinkedProviderAccountsSnapshot().claudeCode,
      getCredentials: () => getLinkedClaudeCodeCredentials(),
      refreshCredentials: () => refreshLinkedClaudeCodeCredentials(),
    }),
  ];
  if (config.openAiApiKey) {
    providers.push(normalizePlugin(openaiPlugin));
  }
  if (config.anthropicApiKey) {
    providers.push(normalizePlugin(anthropicPlugin));
  }

  const messaging: Plugin[] = [];
  if (config.telegramBotToken) {
    messaging.push(normalizePlugin(telegramPlugin));
  }
  messaging.push(
    createDiscordPlugin({
      enabled: Boolean(config.discordBotToken),
      tokenConfigured: Boolean(config.discordBotToken),
    }),
  );

  const knowledge: Plugin[] = [
    createKnowledgePlugin({
      knowledge: {
        extractPdf: (path) => services.documents.extractPdf(path),
      },
      memory: {
        list: (target: MemoryTarget = "memory") => services.memory.list(target),
        remember: (
          target: MemoryTarget,
          input: { text: string; source: string },
        ) => services.memory.remember(target, input),
        read: (target: MemoryTarget = "memory") => services.memory.read(target),
        summary: (target: MemoryTarget = "memory") =>
          services.memory.summary(target),
      },
      sessions: services.sessions,
    }),
    createLocalEmbeddingPlugin(),
    createNativePersonalityServicePlugin(services),
    createRolodexPlugin({
      profiles: {
        card: (userId) => services.userProfiles.card(userId),
        remember: (input) =>
          services.userProfiles.remember(
            input.userId,
            input.kind as never,
            input.text,
            input.source,
          ),
        recall: (userId, query) => services.userProfiles.recall(userId, query),
        observeAgent: (input) =>
          services.userProfiles.observeAgent(input.text, input.source),
        agentProfile: () => services.userProfiles.agentProfile(),
        search: (query, limit) => services.userProfiles.search(query, limit),
        beliefs: (userId) => services.userProfiles.beliefs(userId),
        relationship: (userId) => services.userProfiles.relationship(userId),
        engagement: (userId) => services.userProfiles.engagement(userId),
        summary: () => services.userProfiles.summary(),
      },
    }),
    createExperiencePlugin({
      sessions: {
        usage: (sessionId) => services.sessions.usage(sessionId),
        latest: (limit = 5) => services.sessions.latest(limit),
        summary: () => services.sessions.summary(),
      },
      memory: {
        read: (target) => services.memory.read(target),
        summary: (target = "memory") => services.memory.summary(target),
      },
    }),
  ];

  const browser: Plugin[] = [
    createBrowserPlugin({
      browser: {
        status: () => services.web.status(),
        fetchText: (url) => services.web.fetchText(url),
        inspect: (url) => services.web.inspect(url),
        snapshot: (url) => services.web.snapshot(url),
        screenshot: (url) => services.web.screenshot(url),
        capture: (url) => services.web.capture(url),
        analyze: (url) => services.web.analyze(url),
        compare: (leftUrl, rightUrl) => services.web.compare(leftUrl, rightUrl),
        analyzeComparison: (leftUrl, rightUrl) =>
          services.web.analyzeComparison(leftUrl, rightUrl),
      },
    }),
  ];

  const media: Plugin[] = [];
  if (config.falApiKey) {
    media.push(normalizePlugin(TTSGenerationPlugin));
  }

  const research: Plugin[] = [
    normalizePlugin(actionBenchPlugin),
    createAutocoderPlugin({
      terminal: {
        run: (command, timeoutMs) => services.terminal.run(command, timeoutMs),
      },
      repository: {
        isRepository: () => services.repository.isRepository(),
        status: () => services.repository.status(),
        diffStat: () => services.repository.diffStat(),
        recentCommits: (limit = 5) => services.repository.recentCommits(limit),
      },
      workspace: {
        rootDir: () => config.workspaceDir,
      },
    }),
  ];

  const execution: Plugin[] = [
    normalizePlugin(e2bPlugin),
    normalizePlugin(formsPlugin),
    createNativeShellServicePlugin(services),
    createCodingAgentPlugin({
      workspace: services.workspace,
      repository: {
        status: () => services.repository.status(),
        diff: () => services.repository.diffStat(),
        log: (limit = 10) => services.repository.recentCommits(limit),
      },
      shell: {
        run: (command) => services.terminal.run(command),
      },
      delegation: {
        create: (input) =>
          services.delegation.create({
            ...input,
            metadata: normalizeMetadata(input.metadata),
          }),
        list: () => services.delegation.list(),
      },
    }),
    createAgentOrchestratorPlugin({
      delegation: {
        create: (input) =>
          services.delegation.create({
            ...input,
            priority:
              input.priority === "low" ||
              input.priority === "high" ||
              input.priority === "normal"
                ? input.priority
                : "normal",
            metadata: normalizeMetadata(input.metadata),
          }),
        list: () => services.delegation.list(),
        get: (id) => services.delegation.get(id),
        queueSummary: () => services.delegation.queueSummary(),
        overview: () => services.delegation.overview(),
        getChildren: (id) => services.delegation.listChildren(id),
        tree: (id) => services.delegation.tree(id),
        spawnChild: (parentId, input) =>
          services.delegation.spawnChild(parentId, {
            ...input,
            priority:
              input.priority === "low" ||
              input.priority === "high" ||
              input.priority === "normal"
                ? input.priority
                : "normal",
            metadata: normalizeMetadata(input.metadata),
          }),
        retryTask: (id, note, options) =>
          services.delegation.requeue(id, note, options),
        cancel: (id, note) => services.delegation.cancel(id, note),
        supervise: (runner, options) =>
          services.delegation.supervise(runner as never, options as never),
        runQueued: (runner, options) =>
          services.delegation.runQueued(runner as never, options as never),
      },
    }),
    createPluginManagerPlugin({
      plugins: {
        list: () => catalog,
        categories: () => groupedCatalog,
        summary: () => ({
          total: catalog.length,
          enabled: catalog.filter((entry) => entry.enabled).length,
          official: catalog.filter((entry) => entry.source === "official")
            .length,
          vendored: catalog.filter((entry) => entry.source === "vendored")
            .length,
          categories: Object.keys(groupedCatalog).length,
        }),
      },
    }),
    createPlanningPlugin({
      delegation: {
        list: () => services.delegation.list(),
        get: (id) => services.delegation.get(id),
      },
      workflows: {
        list: (limit = 50) => services.autocoderPipeline.listWorkflows(limit),
        get: (id) => services.autocoderPipeline.workflow(id),
      },
    }),
  ];

  const integration: Plugin[] = [createNativeMcpServicePlugin(services)];

  const automation: Plugin[] = [
    createNativeCronServicePlugin(services),
    createAgentSkillsPlugin({
      skills: {
        list: () => services.skills.list(),
        get: (slug) => services.skills.get(slug),
        generated: () => services.skillSynthesis.listGeneratedSkills(),
        catalog: (limit) => services.skills.catalog(limit),
        searchCatalog: (query, limit) =>
          services.skills.searchCatalog(query, limit),
      },
      synthesis: {
        synthesize: async (taskId) => {
          const task = services.delegation.get(taskId);
          return services.skillSynthesis.synthesize(task);
        },
      },
    }),
    createNativeTrajectoryLoggerServicePlugin(services),
  ];

  const product: Plugin[] = [createElizaAgentPlugin(services, config)];
  const all = [
    ...foundation,
    ...providers,
    ...messaging,
    ...knowledge,
    ...browser,
    ...media,
    ...research,
    ...execution,
    ...integration,
    ...automation,
    ...product,
  ];

  if (!hasOfficialModelProvider(config)) {
    return {
      catalog,
      groupedCatalog,
      foundation,
      providers,
      messaging,
      knowledge,
      browser,
      media,
      research,
      execution,
      integration,
      automation,
      product,
      all,
    };
  }

  return {
    catalog,
    groupedCatalog,
    foundation,
    providers,
    messaging,
    knowledge,
    browser,
    media,
    research,
    execution,
    integration,
    automation,
    product,
    all,
  };
}

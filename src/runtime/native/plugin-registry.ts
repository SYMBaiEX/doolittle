import type { Plugin } from "@elizaos/core";
import { createAgentOrchestratorPlugin } from "@elizaos/plugin-agent-orchestrator";
import { createAgentSkillsPlugin } from "@elizaos/plugin-agent-skills";
import anthropicPlugin from "@elizaos/plugin-anthropic";
import { createCodingAgentPlugin } from "@elizaos/plugin-coding-agent";
import { createCronPlugin } from "@elizaos/plugin-cron";
import { createDiscordPlugin } from "@elizaos/plugin-discord";
import { createExperiencePlugin } from "@elizaos/plugin-experience";
import { createKnowledgePlugin } from "@elizaos/plugin-knowledge";
import { createLocalEmbeddingPlugin } from "@elizaos/plugin-local-embedding";
import { openaiPlugin } from "@elizaos/plugin-openai";
import { pdfPlugin } from "@elizaos/plugin-pdf";
import { createPersonalityPlugin } from "@elizaos/plugin-personality";
import { createPluginManagerPlugin } from "@elizaos/plugin-plugin-manager";
import { createRolodexPlugin } from "@elizaos/plugin-rolodex";
import { createShellPlugin } from "@elizaos/plugin-shell";
import sqlPlugin from "@elizaos/plugin-sql";
import telegramPlugin from "@elizaos/plugin-telegram";
import { createTrajectoryLoggerPlugin } from "@elizaos/plugin-trajectory-logger";
import { createElizaAgentPlugin } from "@/plugins/eliza-agent-plugin";
import type { AppServices } from "@/services";
import type { EnvConfig } from "@/types";
import {
  getNativePluginCatalog,
  groupNativePluginCatalog,
} from "./plugin-catalog";

export interface NativePluginAssembly {
  catalog: ReturnType<typeof getNativePluginCatalog>;
  groupedCatalog: ReturnType<typeof groupNativePluginCatalog>;
  foundation: Plugin[];
  providers: Plugin[];
  messaging: Plugin[];
  knowledge: Plugin[];
  execution: Plugin[];
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
  const catalog = getNativePluginCatalog(config);
  const groupedCatalog = groupNativePluginCatalog(catalog);

  const foundation: Plugin[] = [];
  const providers: Plugin[] = [
    normalizePlugin(sqlPlugin),
    normalizePlugin(pdfPlugin),
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
      memory: services.memory,
      sessions: services.sessions,
    }),
    createLocalEmbeddingPlugin(),
    createPersonalityPlugin({
      personalities: {
        list: () => services.personalities.list(),
        get: (id) => services.personalities.get(id),
        setActive: (id) => services.personalities.setActive(id),
        activeId: () => services.personalities.activeId(),
      },
    }),
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
      },
    }),
    createExperiencePlugin({
      sessions: {
        usage: (sessionId) => services.sessions.usage(sessionId),
        latest: (limit = 5) => services.sessions.latest(limit),
      },
      memory: {
        read: (target) => services.memory.read(target),
      },
    }),
  ];

  const execution: Plugin[] = [
    createShellPlugin({
      terminal: {
        run: (command) => services.terminal.run(command),
        getHistory: (limit = 20) => services.terminal.getHistory(limit),
        status: () => services.terminal.status(),
      },
    }),
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
        queueSummary: () => services.delegation.queueSummary(),
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
      },
    }),
  ];

  const automation: Plugin[] = [
    createCronPlugin({
      cron: {
        list: () => services.cron.list(),
        get: (id) => services.cron.get(id),
        create: (input) => services.cron.create(input as never),
        update: (id, patch) => services.cron.update(id, patch as never),
        runs: (limit = 20) => services.cron.runs(limit),
      },
    }),
    createAgentSkillsPlugin({
      skills: services.skills,
      synthesis: {
        synthesize: async (taskId) => {
          const task = services.delegation.get(taskId);
          return services.skillSynthesis.synthesize(task);
        },
      },
    }),
    createTrajectoryLoggerPlugin({
      trajectories: {
        exportLatest: () => services.trajectories.exportLatest(),
        listBundles: () => services.trajectories.listBundles(),
        compareLatest: () => services.trajectories.compareLatest(),
      },
    }),
  ];

  const product: Plugin[] = [createElizaAgentPlugin(services, config)];
  const all = [
    ...foundation,
    ...providers,
    ...messaging,
    ...knowledge,
    ...execution,
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
      execution,
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
    execution,
    automation,
    product,
    all,
  };
}

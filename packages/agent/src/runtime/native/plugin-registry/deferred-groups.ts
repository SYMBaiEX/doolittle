import { join } from "node:path";
import type { Plugin } from "@elizaos/core";
import type { AppServices } from "../../../services";
import type { EnvConfig, MemoryTarget } from "../../../types/runtime";
import { describeNativeSpeechStatus } from "../plugin-assembly-support";
import { normalizePlugin } from "./support";

export interface NativeDeferredPluginGroups {
  messaging: Plugin[];
  knowledge: Plugin[];
  browser: Plugin[];
  media: Plugin[];
  research: Plugin[];
  execution: Plugin[];
  integration: Plugin[];
  automation: Plugin[];
}

export function createEmptyDeferredPluginGroups(): NativeDeferredPluginGroups {
  return {
    messaging: [],
    knowledge: [],
    browser: [],
    media: [],
    research: [],
    execution: [],
    integration: [],
    automation: [],
  };
}

export async function loadDeferredPluginGroups(
  services: AppServices,
  config: EnvConfig,
): Promise<NativeDeferredPluginGroups> {
  const messaging: Plugin[] = [];
  if (config.telegramBotToken) {
    const { default: telegramPlugin } = await import(
      "@elizaos/plugin-telegram"
    );
    messaging.push(normalizePlugin(telegramPlugin));
  }
  {
    const { createDiscordPlugin } = await import("@elizaos/plugin-discord");
    messaging.push(
      createDiscordPlugin({
        enabled: Boolean(config.discordBotToken),
        tokenConfigured: Boolean(config.discordBotToken),
      }),
    );
  }

  const [{ createKnowledgePlugin }] = await Promise.all([
    import("@elizaos/plugin-knowledge"),
  ]);

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
  ];

  const { createBrowserPlugin } = await import("@elizaos/plugin-browser");
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
  {
    const { createTtsPlugin } = await import("@elizaos/plugin-tts");
    media.push(
      createTtsPlugin({
        speech: {
          status: () => describeNativeSpeechStatus(config),
          speak: (text, options) =>
            services.media.speakWithModel(text, options),
        },
      }),
    );
  }

  const [{ actionBenchPlugin }, { createAutocoderPlugin }] = await Promise.all([
    import("@elizaos/plugin-action-bench"),
    import("@elizaos/plugin-autocoder"),
  ]);
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
      storage: {
        dataRoot: join(config.dataDir, "plugins"),
      },
    }),
  ];

  const [{ e2bPlugin }, { createFormsPlugin }] = await Promise.all([
    import("@elizaos/plugin-e2b"),
    import("@elizaos/plugin-forms"),
  ]);
  const execution: Plugin[] = [
    normalizePlugin(e2bPlugin),
    createFormsPlugin({
      storage: {
        dataRoot: join(config.dataDir, "plugins"),
      },
    }),
  ];

  const { createMcpPlugin } = await import("@elizaos/plugin-mcp");
  const integration: Plugin[] = [
    createMcpPlugin({
      mcp: {
        status: () => services.mcp.status(),
        probe: () => services.mcp.probe(),
        discoverTools: () => services.mcp.discoverTools(),
        invoke: (input) => services.mcp.invoke(input),
        invokeTool: (name, input) => services.mcp.invokeTool(name, input),
        getCachedTools: () => services.mcp.getCachedTools(),
        searchCachedTools: (query) => services.mcp.searchCachedTools(query),
        describeCachedTools: (limit = 20) =>
          services.mcp.describeCachedTools(limit),
        describeTool: (name) => services.mcp.describeTool(name),
      },
    }),
  ];

  const [
    { createCronPlugin },
    { createAgentSkillsPlugin },
    { createTrajectoryLoggerPlugin },
  ] = await Promise.all([
    import("@elizaos/plugin-cron"),
    import("@elizaos/plugin-agent-skills"),
    import("@elizaos/plugin-trajectory-logger"),
  ]);
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
    createTrajectoryLoggerPlugin({
      trajectories: {
        exportLatest: () => services.trajectories.exportLatest(),
        listBundles: () => services.trajectories.listBundles(),
        compareLatest: () => services.trajectories.compareLatest(),
      },
    }),
  ];

  return {
    messaging,
    knowledge,
    browser,
    media,
    research,
    execution,
    integration,
    automation,
  };
}

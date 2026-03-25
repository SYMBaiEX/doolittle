import type { Plugin } from "@elizaos/core";
import type { ElizaCloudStatus } from "@elizaos/plugin-elizacloud";
import { createElizaAgentPlugin } from "@plugins/eliza-agent-plugin";
import type { AppServices } from "@/services";
import type { EnvConfig, MemoryTarget } from "@/types";
import {
  getLinkedClaudeCodeCredentials,
  getLinkedCodexCredentials,
  getLinkedElizaCloudCredentials,
  getLinkedProviderAccountsSnapshot,
  refreshLinkedClaudeCodeCredentials,
  refreshLinkedCodexCredentials,
} from "./account-auth";
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
  browser: Plugin[];
  media: Plugin[];
  research: Plugin[];
  execution: Plugin[];
  integration: Plugin[];
  automation: Plugin[];
  product: Plugin[];
  initial: Plugin[];
  deferred: Plugin[];
  all: Plugin[];
}

export interface NativePluginAssemblyOptions {
  hotOnly?: boolean;
}

export function shouldIncludeDirectProviderPlugin(
  selectedProvider: string,
  directProvider: "openai" | "anthropic",
): boolean {
  if (
    selectedProvider === "elizacloud" ||
    selectedProvider === "codex" ||
    selectedProvider === "claude-code"
  ) {
    return false;
  }

  if (selectedProvider === "openai") {
    return directProvider === "openai";
  }

  if (selectedProvider === "anthropic") {
    return directProvider === "anthropic";
  }

  return true;
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

async function loadProviderPlugins(
  services: AppServices,
  config: EnvConfig,
): Promise<Plugin[]> {
  const selectedProvider = services.settings.get().model.provider;
  const [
    { default: sqlPlugin },
    { pdfPlugin },
    { createCodexPlugin },
    { createClaudeCodePlugin },
  ] = await Promise.all([
    import("@elizaos/plugin-sql"),
    import("@elizaos/plugin-pdf"),
    import("@elizaos/plugin-codex"),
    import("@elizaos/plugin-claude-code"),
  ]);

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

  if (selectedProvider === "elizacloud") {
    const { createElizaCloudPlugin } = await import(
      "@elizaos/plugin-elizacloud"
    );
    providers.push(
      createElizaCloudPlugin({
        enabled: true,
        getStatus: (): ElizaCloudStatus => {
          const status = getLinkedProviderAccountsSnapshot().elizaCloud;
          return {
            provider: "elizacloud" as const,
            available: status.available,
            reusable: status.reusable,
            nativeReady: status.nativeReady,
            source: status.source,
            authMode: status.authMode,
            detail: status.detail,
          };
        },
        getCredentials: () => getLinkedElizaCloudCredentials(),
      }),
    );
  }

  const optionalProviderImports: Promise<Plugin | null>[] = [];
  if (
    config.openAiApiKey &&
    shouldIncludeDirectProviderPlugin(selectedProvider, "openai")
  ) {
    optionalProviderImports.push(
      import("@elizaos/plugin-openai").then(({ openaiPlugin }) =>
        normalizePlugin(openaiPlugin),
      ),
    );
  }
  if (
    config.anthropicApiKey &&
    shouldIncludeDirectProviderPlugin(selectedProvider, "anthropic")
  ) {
    optionalProviderImports.push(
      import("@elizaos/plugin-anthropic").then(({ default: anthropicPlugin }) =>
        normalizePlugin(anthropicPlugin),
      ),
    );
  }

  providers.push(
    ...(await Promise.all(optionalProviderImports)).filter(
      (plugin): plugin is Plugin => Boolean(plugin),
    ),
  );

  return providers;
}

async function loadHotExecutionPlugins(
  services: AppServices,
  catalog: ReturnType<typeof getNativePluginCatalog>,
  groupedCatalog: ReturnType<typeof groupNativePluginCatalog>,
): Promise<Plugin[]> {
  const [
    { createShellPlugin },
    { createCodingAgentPlugin },
    { createAgentOrchestratorPlugin },
    { createPluginManagerPlugin },
    { createPlanningPlugin },
  ] = await Promise.all([
    import("@elizaos/plugin-shell"),
    import("@elizaos/plugin-coding-agent"),
    import("@elizaos/plugin-agent-orchestrator"),
    import("@elizaos/plugin-plugin-manager"),
    import("@elizaos/plugin-planning"),
  ]);

  return [
    createShellPlugin({
      terminal: {
        run: (command) => services.terminal.run(command),
        getHistory: (limit = 20) => services.terminal.getHistory(limit),
        status: () => services.terminal.status(),
      },
    }),
    createCodingAgentPlugin({
      workspaceRoot: services.workspace.root(),
      workspace: services.workspace,
      repository: {
        isRepository: () => services.repository.isRepository(),
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
}

async function loadHotIdentityPlugins(
  services: AppServices,
): Promise<Plugin[]> {
  const [
    { createPersonalityPlugin },
    { createRolodexPlugin },
    { createExperiencePlugin },
  ] = await Promise.all([
    import("@elizaos/plugin-personality"),
    import("@elizaos/plugin-rolodex"),
    import("@elizaos/plugin-experience"),
  ]);

  return [
    createPersonalityPlugin({
      personalities: {
        list: () => services.personalities.list(),
        get: (id) => services.personalities.get(id),
        setActive: (id) => services.personalities.setActive(id),
        activeId: () => services.personalities.activeId(),
        summary: () => services.personalities.summary(),
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
}

async function loadDeferredPluginGroups(
  services: AppServices,
  config: EnvConfig,
): Promise<
  Pick<
    NativePluginAssembly,
    | "messaging"
    | "knowledge"
    | "browser"
    | "media"
    | "research"
    | "execution"
    | "integration"
    | "automation"
  >
> {
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
  if (config.falApiKey) {
    const { TTSGenerationPlugin } = await import("@elizaos/plugin-tts");
    media.push(normalizePlugin(TTSGenerationPlugin));
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
    }),
  ];

  const [{ e2bPlugin }, { default: formsPlugin }] = await Promise.all([
    import("@elizaos/plugin-e2b"),
    import("@elizaos/plugin-forms"),
  ]);
  const execution: Plugin[] = [
    normalizePlugin(e2bPlugin),
    normalizePlugin(formsPlugin),
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

export async function buildNativePluginAssembly(
  services: AppServices,
  config: EnvConfig,
  options: NativePluginAssemblyOptions = {},
): Promise<NativePluginAssembly> {
  const catalog = getNativePluginCatalog(config);
  const groupedCatalog = groupNativePluginCatalog(catalog);
  const foundation: Plugin[] = [];
  const providers = await loadProviderPlugins(services, config);
  const identity = await loadHotIdentityPlugins(services);
  const execution = await loadHotExecutionPlugins(
    services,
    catalog,
    groupedCatalog,
  );
  const product: Plugin[] = [createElizaAgentPlugin(services, config)];
  const initial = [
    ...foundation,
    ...providers,
    ...identity,
    ...execution,
    ...product,
  ];

  const emptyDeferred = {
    messaging: [] as Plugin[],
    knowledge: [] as Plugin[],
    browser: [] as Plugin[],
    media: [] as Plugin[],
    research: [] as Plugin[],
    integration: [] as Plugin[],
    automation: [] as Plugin[],
  };

  if (options.hotOnly) {
    return {
      catalog,
      groupedCatalog,
      foundation,
      providers,
      messaging: emptyDeferred.messaging,
      knowledge: identity,
      browser: emptyDeferred.browser,
      media: emptyDeferred.media,
      research: emptyDeferred.research,
      execution,
      integration: emptyDeferred.integration,
      automation: emptyDeferred.automation,
      product,
      initial,
      deferred: [],
      all: initial,
    };
  }

  const deferredGroups = await loadDeferredPluginGroups(services, config);
  const deferred = [
    ...deferredGroups.messaging,
    ...deferredGroups.knowledge,
    ...deferredGroups.browser,
    ...deferredGroups.media,
    ...deferredGroups.research,
    ...deferredGroups.execution,
    ...deferredGroups.integration,
    ...deferredGroups.automation,
  ];

  return {
    catalog,
    groupedCatalog,
    foundation,
    providers,
    knowledge: [...identity, ...deferredGroups.knowledge],
    messaging: deferredGroups.messaging,
    browser: deferredGroups.browser,
    media: deferredGroups.media,
    research: deferredGroups.research,
    execution: [...execution, ...deferredGroups.execution],
    integration: deferredGroups.integration,
    automation: deferredGroups.automation,
    product,
    initial,
    deferred,
    all: [...initial, ...deferred],
  };
}

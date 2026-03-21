import type {
  Action,
  Evaluator,
  GenerateTextParams,
  IAgentRuntime,
  Plugin,
  Provider,
  Service,
} from "@elizaos/core";
import { Service as ElizaService, ModelType } from "@elizaos/core";
import {
  type AgentExecutionContext,
  type AppContext,
  type AppServices,
  createAgentContextProvider,
  createCronAction,
  createMemoryAction,
  createMemoryNudgeEvaluator,
  createRepositoryAction,
  createSessionSearchAction,
  createSkillsAction,
  createTerminalAction,
  createWorkspaceAction,
  type EnvConfig,
  GatewayRunner,
  handleAgentTurn,
} from "@/plugin-api";
import type { CronJobRecord } from "@/types";

function createOpenAiBackedTextModel(config: EnvConfig) {
  return async (
    runtime: { getSetting?: (key: string) => Promise<unknown> } | unknown,
    params: GenerateTextParams,
  ): Promise<string> => {
    const runtimeSettingsRaw =
      runtime && typeof runtime === "object" && "getSetting" in runtime
        ? await (
            runtime as { getSetting: (key: string) => Promise<unknown> }
          ).getSetting("runtimeSettings")
        : undefined;
    const runtimeSettings =
      typeof runtimeSettingsRaw === "string"
        ? (JSON.parse(runtimeSettingsRaw) as {
            model?: {
              baseUrl?: string;
              model?: string;
              temperature?: number;
              maxTokens?: number;
            };
          })
        : undefined;
    const modelSettings = runtimeSettings?.model;
    const baseUrl = modelSettings?.baseUrl ?? config.openAiBaseUrl;
    const model = modelSettings?.model ?? config.openAiModel;
    const temperature = modelSettings?.temperature ?? config.openAiTemperature;
    const maxTokens = modelSettings?.maxTokens ?? config.openAiMaxTokens;

    if (!config.openAiApiKey) {
      return [
        "Eliza Agent is running in offline bootstrap mode.",
        "Set OPENAI_API_KEY to enable real model-backed responses.",
        "",
        "Prompt excerpt:",
        params.prompt.slice(0, 600),
      ].join("\n");
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.openAiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature,
        max_tokens: params.maxTokens ?? maxTokens,
        messages: [
          {
            role: "user",
            content: params.prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `OpenAI-compatible request failed (${response.status}): ${body}`,
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    return (
      data.choices?.[0]?.message?.content?.trim() ?? "No response returned."
    );
  };
}

function hasOfficialModelProvider(config: EnvConfig): boolean {
  return Boolean(config.openAiApiKey || config.anthropicApiKey);
}

export function createElizaAgentPlugin(
  services: AppServices,
  config: EnvConfig,
): Plugin {
  class GatewayRuntimeService extends ElizaService {
    static serviceType = "eliza_agent_gateway";
    capabilityDescription =
      "Manages the Eliza Agent gateway lifecycle and platform routing.";

    runner!: GatewayRunner;

    static async start(runtime: IAgentRuntime): Promise<Service> {
      const context = {
        config,
        services,
        runtime: runtime as never,
      } as unknown as AppContext;
      const runner = new GatewayRunner(context);
      context.gateway = runner;
      const service = new GatewayRuntimeService(runtime);
      service.runner = runner;
      return service;
    }

    async startGateway(): Promise<void> {
      await this.runner.start();
    }

    async stop(): Promise<void> {
      await this.runner.stop();
    }
  }

  class SchedulerRuntimeService extends ElizaService {
    static serviceType = "eliza_agent_scheduler";
    capabilityDescription =
      "Runs recurring automations and session maintenance for Eliza Agent.";

    #intervalId: ReturnType<typeof setInterval> | null = null;

    static async start(runtime: IAgentRuntime): Promise<Service> {
      const service = new SchedulerRuntimeService(runtime);
      await service.startScheduler(runtime);
      return service;
    }

    private async startScheduler(runtime: IAgentRuntime): Promise<void> {
      const executionContext: AgentExecutionContext = {
        config,
        services,
        runtime: runtime as never,
      };
      const gatewayService = runtime.getService("eliza_agent_gateway") as {
        runner?: GatewayRunner;
      } | null;
      const gateway = gatewayService?.runner;

      services.cron.setExecutor(async (job: CronJobRecord) => {
        const output = await handleAgentTurn(
          {
            message: job.prompt,
            userId: "cron",
            roomId: `cron:${job.id}`,
            source: "cron",
          },
          executionContext,
        );
        if (job.delivery === "home" && gateway) {
          const deliveries = await gateway.sendToHomes(output, {
            metadata: {
              cronJobId: job.id,
              cronJobName: job.name,
            },
            name: job.name,
          });
          return deliveries.length > 0
            ? `${output}\n\nDelivered to ${deliveries.length} home channel${deliveries.length === 1 ? "" : "s"}.`
            : `${output}\n\nNo home channels are configured yet for delivery.`;
        }
        return output;
      });

      services.cron.start();
      this.#intervalId = setInterval(async () => {
        const settings = services.settings.get();
        const expired = services.gatewaySessions.expireOlderThan(
          settings.gateway.sessionTimeoutMinutes,
        );
        if (expired.length > 0) {
          await services.hooks.emit("session:expired", {
            count: expired.length,
          });
        }
      }, 60_000);
      this.#intervalId.unref?.();
    }

    async stop(): Promise<void> {
      services.cron.stop();
      if (this.#intervalId) {
        clearInterval(this.#intervalId);
        this.#intervalId = null;
      }
    }
  }

  const actions: Action[] = [
    createMemoryAction(services),
    createSkillsAction(services),
    createSessionSearchAction(services, config.sessionSearchLimit),
    createCronAction(services),
    createWorkspaceAction(services),
    createTerminalAction(services),
    createRepositoryAction(services),
  ];
  const providers: Provider[] = [createAgentContextProvider(services)];
  const evaluators: Evaluator[] = [createMemoryNudgeEvaluator(services)];
  const plugin: Plugin = {
    name: "eliza-agent-runtime",
    description:
      "Persistent memory, skills, search, and scheduling for Eliza Agent on ElizaOS.",
    actions,
    providers,
    evaluators,
    services: [GatewayRuntimeService, SchedulerRuntimeService],
  };

  if (!hasOfficialModelProvider(config)) {
    const textModel = createOpenAiBackedTextModel(config);
    plugin.models = {
      [ModelType.TEXT_SMALL]: textModel,
      [ModelType.TEXT_LARGE]: textModel,
    };
  }

  return plugin;
}

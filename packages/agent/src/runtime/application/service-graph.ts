import {
  type AppServiceAssembly,
  createServiceAssembly,
} from "../../services/index";
import type { EnvConfig } from "../../types/runtime/index";
import { readWorkerBotProfile } from "../bootstrap/bot-profile";
import { loadBootstrapConfig } from "../bootstrap/env/index";
import { appendBootstrapTrace } from "../bootstrap/trace";

/** Process/profile composition identity, retained across lazy runtime activation. */
export interface ApplicationServiceGraph extends AppServiceAssembly {
  readonly config: EnvConfig;
  readonly workerBot: ReturnType<typeof readWorkerBotProfile>;
}

export function createApplicationServiceGraph(
  config?: EnvConfig,
): ApplicationServiceGraph {
  // The host owns environment discovery, including embedded database startup.
  process.env.ELIZA_BENCH_DISABLE_DOTENV = "1";
  const applicationConfig = config ?? loadBootstrapConfig();
  const workerBot = readWorkerBotProfile();
  if (workerBot && applicationConfig.agentName !== workerBot.name) {
    throw new Error("The named bot identity does not match its runtime name.");
  }
  appendBootstrapTrace("phase:createServices:start");
  const assembly = createServiceAssembly(applicationConfig);
  if (workerBot) {
    assembly.services.settings.setMany([
      { path: "model.provider", value: workerBot.model.provider },
      { path: "model.model", value: workerBot.model.model },
      ...(workerBot.model.reasoningEffort
        ? [
            {
              path: "model.reasoningEffort",
              value: workerBot.model.reasoningEffort,
            },
          ]
        : []),
    ]);
  }
  appendBootstrapTrace("phase:createServices:done");
  return { config: applicationConfig, workerBot, ...assembly };
}

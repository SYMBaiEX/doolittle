import { createElizaMcpSettingsFromCommand } from "../../../packages/agent/src/services/mcp/settings";
import type { RuntimeSettings, WizardAnswers } from "../types";

export function buildBootstrapSettings(
  settings: RuntimeSettings,
  answers: WizardAnswers,
): RuntimeSettings {
  const configuredMcp = createElizaMcpSettingsFromCommand(
    answers.tools.mcp ? answers.mcpServerCommand : "",
    firstMcpTimeout(settings),
  );
  const nextSettings = {
    ...settings,
    ui: { ...settings.ui, theme: answers.theme },
    agent: {
      ...settings.agent,
      runDepth: answers.runDepth,
      maxIterations: answers.maxIterations,
      toolProgressMode: answers.toolProgressMode,
    },
    execution: {
      ...settings.execution,
      backend: answers.backend,
      sshHost: answers.backend === "ssh" ? answers.sshHost : "",
      sshUser: answers.backend === "ssh" ? answers.sshUser : "",
      sshPath: answers.backend === "ssh" ? answers.sshPath : "",
      daytonaTarget: answers.backend === "daytona" ? answers.daytonaTarget : "",
      modalTarget: answers.backend === "modal" ? answers.modalTarget : "",
    },
    mcp: answers.tools.mcp
      ? {
          ...settings.mcp,
          servers: {
            ...settings.mcp.servers,
            ...configuredMcp.servers,
          },
        }
      : settings.mcp,
  } satisfies RuntimeSettings;

  if (answers.provider === "elizacloud") {
    nextSettings.model.provider = "elizacloud";
    nextSettings.model.model = answers.elizaCloudModel;
    nextSettings.model.baseUrl = "https://elizacloud.ai/api/v1";
  } else if (answers.provider === "ollama") {
    nextSettings.model.provider = "ollama";
    nextSettings.model.model = answers.ollamaLargeModel;
    nextSettings.model.baseUrl = answers.ollamaApiEndpoint;
  } else if (answers.provider === "devin") {
    nextSettings.model.provider = "devin";
    nextSettings.model.model = answers.devinModel ?? "swe-1-6-fast";
    nextSettings.model.baseUrl = "";
  } else if (
    answers.provider === "anthropic" ||
    answers.provider === "claude-code"
  ) {
    nextSettings.model.provider =
      answers.provider === "claude-code" ? "claude-code" : "anthropic";
    nextSettings.model.model = answers.anthropicModel;
    nextSettings.model.baseUrl = "";
  } else {
    nextSettings.model.provider =
      answers.provider === "codex" ? "codex" : "openai";
    nextSettings.model.model = answers.openaiModel;
    nextSettings.model.baseUrl =
      answers.provider === "codex"
        ? "https://chatgpt.com/backend-api/codex"
        : "https://api.openai.com/v1";
  }

  return nextSettings;
}

function firstMcpTimeout(settings: RuntimeSettings): number {
  for (const server of Object.values(settings.mcp.servers)) {
    if (server.type === "stdio" && server.timeoutInMillis) {
      return server.timeoutInMillis;
    }
    if (server.type !== "stdio" && server.timeout) {
      return server.timeout;
    }
  }
  return 10_000;
}

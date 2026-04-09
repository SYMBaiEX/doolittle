import type { RuntimeSettings, WizardAnswers } from "../types";

export function buildBootstrapSettings(
  settings: RuntimeSettings,
  answers: WizardAnswers,
): RuntimeSettings {
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
    mcp: {
      ...settings.mcp,
      serverCommand: answers.tools.mcp ? answers.mcpServerCommand : "",
    },
  } satisfies RuntimeSettings;

  if (answers.provider === "elizacloud") {
    nextSettings.model.provider = "elizacloud";
    nextSettings.model.model = answers.elizaCloudModel;
    nextSettings.model.baseUrl = "https://www.elizacloud.ai/api/v1";
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

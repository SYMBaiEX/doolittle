import type {
  BootstrapDependencyProbe,
  BrowserMode,
  ExecutionBackendName,
  WizardAnswers,
} from "../types";

export interface ExecutionToolSelection {
  mcp: boolean;
  acp: boolean;
  tts: boolean;
  codegen: boolean;
}

export interface ExecutionFlowResult {
  runDepth: WizardAnswers["runDepth"];
  maxIterations: number;
  toolProgressMode: WizardAnswers["toolProgressMode"];
  backend: WizardAnswers["backend"];
  browser: WizardAnswers["browser"];
  sshHost: WizardAnswers["sshHost"];
  sshUser: WizardAnswers["sshUser"];
  sshPath: WizardAnswers["sshPath"];
  daytonaTarget: WizardAnswers["daytonaTarget"];
  modalTarget: WizardAnswers["modalTarget"];
  transports: WizardAnswers["transports"];
  pairingMode: WizardAnswers["pairingMode"];
  allowAllUsers: WizardAnswers["allowAllUsers"];
  telegramBotToken: WizardAnswers["telegramBotToken"];
  discordBotToken: WizardAnswers["discordBotToken"];
  slackWebhookUrl: WizardAnswers["slackWebhookUrl"];
  slackSigningSecret: WizardAnswers["slackSigningSecret"];
  homeAssistantUrl: WizardAnswers["homeAssistantUrl"];
  homeAssistantToken: WizardAnswers["homeAssistantToken"];
  tools: WizardAnswers["tools"];
  mcpServerCommand: WizardAnswers["mcpServerCommand"];
  acpServerCommand: WizardAnswers["acpServerCommand"];
  falApiKey: WizardAnswers["falApiKey"];
  e2bApiKey: WizardAnswers["e2bApiKey"];
  githubToken: WizardAnswers["githubToken"];
}

export function resolvePreferredBrowserDefault(
  existingEnv: Map<string, string>,
  dependencyProbes: BootstrapDependencyProbe[],
): BrowserMode {
  return dependencyProbes.find((entry) => entry.key === "lightpanda")?.installed
    ? (existingEnv.get("DOOLITTLE_BROWSER_PROVIDER") as BrowserMode) ||
        "lightpanda"
    : "basic";
}

export function resolveBackendProbeKey(
  backend: ExecutionBackendName,
): ExecutionBackendName | undefined {
  return backend === "docker" ||
    backend === "podman" ||
    backend === "ssh" ||
    backend === "daytona" ||
    backend === "modal"
    ? backend
    : undefined;
}

export function resolveExecutionToolDefaults(
  mode: WizardAnswers["mode"],
  existingEnv: Map<string, string>,
): ExecutionToolSelection {
  return {
    mcp:
      mode === "ritual"
        ? Boolean(existingEnv.get("MCP_SERVER_COMMAND"))
        : Boolean(existingEnv.get("MCP_SERVER_COMMAND")),
    acp:
      mode === "ritual"
        ? Boolean(existingEnv.get("ACP_SERVER_COMMAND"))
        : Boolean(existingEnv.get("ACP_SERVER_COMMAND")),
    tts:
      mode === "ritual"
        ? Boolean(existingEnv.get("FAL_API_KEY"))
        : Boolean(existingEnv.get("FAL_API_KEY")),
    codegen:
      mode === "ritual"
        ? Boolean(
            existingEnv.get("E2B_API_KEY") || existingEnv.get("GITHUB_TOKEN"),
          )
        : Boolean(
            existingEnv.get("E2B_API_KEY") || existingEnv.get("GITHUB_TOKEN"),
          ),
  };
}

export function resolveMcpPresetCommand(preset: string): string {
  return preset === "filesystem"
    ? "npx -y @modelcontextprotocol/server-filesystem ."
    : "";
}

export function resolveAcpPresetCommand(preset: string): string {
  return preset === "local-agent" ? "doolittle api" : "";
}

export function applyExecutionFlowResult(
  answers: WizardAnswers,
  result: ExecutionFlowResult,
): void {
  answers.runDepth = result.runDepth;
  answers.maxIterations = result.maxIterations;
  answers.toolProgressMode = result.toolProgressMode;
  answers.backend = result.backend;
  answers.browser = result.browser;
  answers.sshHost = result.sshHost;
  answers.sshUser = result.sshUser;
  answers.sshPath = result.sshPath;
  answers.daytonaTarget = result.daytonaTarget;
  answers.modalTarget = result.modalTarget;
  answers.transports = result.transports;
  answers.pairingMode = result.pairingMode;
  answers.allowAllUsers = result.allowAllUsers;
  answers.telegramBotToken = result.telegramBotToken;
  answers.discordBotToken = result.discordBotToken;
  answers.slackWebhookUrl = result.slackWebhookUrl;
  answers.slackSigningSecret = result.slackSigningSecret;
  answers.homeAssistantUrl = result.homeAssistantUrl;
  answers.homeAssistantToken = result.homeAssistantToken;
  answers.tools = result.tools;
  answers.mcpServerCommand = result.mcpServerCommand;
  answers.acpServerCommand = result.acpServerCommand;
  answers.falApiKey = result.falApiKey;
  answers.e2bApiKey = result.e2bApiKey;
  answers.githubToken = result.githubToken;
}

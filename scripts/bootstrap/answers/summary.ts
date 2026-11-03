import type { WizardAnswers } from "../types";

export function summarizeAnswers(answers: WizardAnswers): string[] {
  const model =
    answers.provider === "anthropic" || answers.provider === "claude-code"
      ? answers.anthropicModel
      : answers.provider === "ollama"
        ? answers.ollamaLargeModel
        : answers.provider === "elizacloud"
          ? answers.elizaCloudModel
          : answers.openaiModel;
  const embeddingDetail =
    answers.provider === "elizacloud"
      ? ` embed=${answers.elizaCloudEmbeddingModel}`
      : answers.provider === "ollama"
        ? ` embed=${answers.ollamaEmbeddingModel} endpoint=${answers.ollamaApiEndpoint}`
        : "";
  return [
    `mind=${answers.provider} model=${model}${embeddingDetail}`,
    `threads=cloud:${answers.elizaCloudApiKey ? "bound" : "idle"} codex:${answers.useLinkedCodexAuth ? "bound" : "idle"} claude:${answers.useLinkedClaudeCodeAuth ? "bound" : "idle"}`,
    `run=${answers.runDepth} cap=${answers.maxIterations} progress=${answers.toolProgressMode}`,
    `body=${answers.backend} eyes=${answers.browser}`,
    `channels=${answers.transports.length ? answers.transports.join(", ") : "api, cli only"}`,
    `tools=${
      [
        answers.tools.mcp ? "mcp" : "",
        answers.tools.acp ? "acp" : "",
        answers.tools.tts ? "tts" : "",
        answers.tools.codegen ? "codegen" : "",
      ]
        .filter(Boolean)
        .join(", ") || "none"
    }`,
    `face=${answers.theme} timezone=${answers.timezone}`,
  ];
}

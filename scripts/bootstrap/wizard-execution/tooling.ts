import type { BootstrapWizardContext } from "../bootstrap-context";
import {
  resolveAcpPresetCommand,
  resolveExecutionToolDefaults,
  resolveMcpPresetCommand,
} from "../execution-flow/helpers";
import type { PromptHandle } from "../prompting/types";
import type { WizardAnswers } from "../types";
import type {
  ExecutionHandsPromptDeps,
  ExecutionToolSelectionResult,
} from "./types";

export async function runExecutionToolSelectionFlow(
  context: BootstrapWizardContext,
  rl: PromptHandle,
  existingEnv: Map<string, string>,
  answers: WizardAnswers,
  promptDeps: ExecutionHandsPromptDeps,
): Promise<ExecutionToolSelectionResult> {
  const tools = resolveExecutionToolDefaults(answers.mode, existingEnv);
  if (answers.mode === "ritual") {
    tools.mcp = await promptDeps.askYesNo(
      context,
      rl,
      "Should I wake up with an MCP bridge already bound",
      tools.mcp,
    );
    tools.acp = await promptDeps.askYesNo(
      context,
      rl,
      "Should I wake up with ACP and editor presence",
      tools.acp,
    );
    tools.tts = await promptDeps.askYesNo(
      context,
      rl,
      "Should I speak on first boot if you have a FAL key",
      tools.tts,
    );
    tools.codegen = await promptDeps.askYesNo(
      context,
      rl,
      "Should I wake up with codegen, research, and E2B online",
      tools.codegen,
    );
  }

  if (answers.mode === "quick") {
    context.section(
      "Hands",
      "Quick ignition keeps the toolkit lean and only preserves bindings you already had.",
    );
    context.info(
      `Preserving: mcp=${tools.mcp ? "yes" : "no"} acp=${tools.acp ? "yes" : "no"} tts=${tools.tts ? "yes" : "no"} codegen=${tools.codegen ? "yes" : "no"}.`,
    );
  } else {
    context.section(
      "Hands",
      "Choose the tools, bridges, and protocols I should wake up holding.",
    );
  }

  let mcpServerCommand = answers.mcpServerCommand;
  let acpServerCommand = answers.acpServerCommand;
  let falApiKey = answers.falApiKey;
  let e2bApiKey = answers.e2bApiKey;
  let githubToken = answers.githubToken;

  if (tools.mcp) {
    if (!mcpServerCommand) {
      const mcpPreset = await promptDeps.chooseOne(
        context,
        rl,
        "How should I open my MCP bridge on first boot?",
        [
          {
            value: "filesystem",
            label: "Filesystem bridge",
            detail:
              "Recommended local default for browsing and editing the workspace through MCP.",
          },
          {
            value: "custom",
            label: "Custom command",
            detail: "I will ask for the exact MCP launch command.",
          },
          {
            value: "later",
            label: "Not now",
            detail: "Skip MCP binding for now and configure it later.",
          },
        ],
        "filesystem",
      );
      if (mcpPreset === "filesystem") {
        mcpServerCommand = resolveMcpPresetCommand(mcpPreset);
      } else if (mcpPreset === "custom") {
        mcpServerCommand = await promptDeps.ask(
          context,
          rl,
          "What MCP server command should I speak through",
          mcpServerCommand,
        );
      }
    } else {
      context.info(`Using existing MCP binding: ${mcpServerCommand}`);
    }
  }

  if (tools.acp) {
    if (!acpServerCommand) {
      const acpPreset = await promptDeps.chooseOne(
        context,
        rl,
        "How should I appear to ACP-aware editors?",
        [
          {
            value: "local-agent",
            label: "Local Doolittle ACP",
            detail:
              "Recommended local default. Editors can launch me through the doolittle command.",
          },
          {
            value: "custom",
            label: "Custom command",
            detail: "I will ask for the exact ACP launch command.",
          },
          {
            value: "later",
            label: "Not now",
            detail: "Skip ACP binding for now and configure it later.",
          },
        ],
        "local-agent",
      );
      if (acpPreset === "local-agent") {
        acpServerCommand = resolveAcpPresetCommand(acpPreset);
      } else if (acpPreset === "custom") {
        acpServerCommand = await promptDeps.ask(
          context,
          rl,
          "What ACP server command should bind me to editors",
          acpServerCommand,
        );
      }
    } else {
      context.info(`Using existing ACP binding: ${acpServerCommand}`);
    }
  }

  if (tools.tts) {
    falApiKey = await promptDeps.askSecret(
      context,
      rl,
      "Paste FAL_API_KEY",
      falApiKey,
    );
  }
  if (tools.codegen) {
    e2bApiKey = await promptDeps.askSecret(
      context,
      rl,
      "Paste E2B_API_KEY",
      e2bApiKey,
    );
    githubToken = await promptDeps.askSecret(
      context,
      rl,
      "Paste GITHUB_TOKEN",
      githubToken,
    );
  }

  return {
    tools,
    mcpServerCommand,
    acpServerCommand,
    falApiKey,
    e2bApiKey,
    githubToken,
  };
}

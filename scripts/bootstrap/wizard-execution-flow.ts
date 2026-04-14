import { RUN_DEPTH_ITERATION_PRESETS } from "../../packages/agent/src/types";
import type { BootstrapWizardContext } from "./bootstrap-context";
import { chooseOne } from "./core/prompt-ops";
import { applyExecutionFlowResult } from "./execution-flow/helpers";
import type { PromptHandle } from "./prompting/types";
import type { BootstrapDependencyProbe, WizardAnswers } from "./types";
import { runExecutionBodySelectionFlow } from "./wizard-execution/body/selection";
import { runExecutionHandsSelectionFlow } from "./wizard-execution/hands";

export async function runExecutionSelectionFlow(
  context: BootstrapWizardContext,
  rl: PromptHandle,
  existingEnv: Map<string, string>,
  dependencyProbes: BootstrapDependencyProbe[],
  answers: WizardAnswers,
): Promise<void> {
  context.section(
    "Cadence",
    "Set how far I should run before I stop and how much of my work I should show while I’m acting.",
  );
  const runDepth = await chooseOne<WizardAnswers["runDepth"]>(
    context,
    rl,
    "How far should I run before I stop and report back?",
    [
      {
        value: "quick",
        label: "Quick report-back",
        detail:
          "About 15 steps. Fastest feedback with a tighter autonomy budget.",
      },
      {
        value: "standard",
        label: "Standard autonomy",
        detail: "About 45 steps. Balanced for most coding and operator tasks.",
      },
      {
        value: "deep",
        label: "Deep work",
        detail:
          "About 90 steps. Better for sustained implementation and debugging.",
      },
      {
        value: "explore",
        label: "Explore",
        detail:
          "About 150 steps. Best for long investigations and broad sweeps.",
      },
    ],
    answers.runDepth,
  );
  const maxIterations = RUN_DEPTH_ITERATION_PRESETS[runDepth];
  const toolProgressMode = await chooseOne<WizardAnswers["toolProgressMode"]>(
    context,
    rl,
    "How much tool activity should I show while I work?",
    [
      {
        value: "off",
        label: "Quiet",
        detail: "Only show the final answer unless something goes wrong.",
      },
      {
        value: "new",
        label: "Changes only",
        detail:
          "Show phase changes and new tool activity without flooding the shell.",
      },
      {
        value: "all",
        label: "All activity",
        detail: "Show each observed tool or action event as it happens.",
      },
      {
        value: "verbose",
        label: "Verbose operator stream",
        detail: "Show the fullest live activity trail and status detail.",
      },
    ],
    answers.toolProgressMode,
  );

  const body = await runExecutionBodySelectionFlow(
    context,
    rl,
    existingEnv,
    dependencyProbes,
    answers,
  );

  const hands = await runExecutionHandsSelectionFlow(
    context,
    rl,
    existingEnv,
    answers,
  );

  applyExecutionFlowResult(answers, {
    runDepth,
    maxIterations,
    toolProgressMode,
    backend: body.backend,
    browser: body.browser,
    sshHost: body.sshHost,
    sshUser: body.sshUser,
    sshPath: body.sshPath,
    daytonaTarget: body.daytonaTarget,
    modalTarget: body.modalTarget,
    transports: hands.transports,
    pairingMode: hands.pairingMode,
    allowAllUsers: hands.allowAllUsers,
    telegramBotToken: hands.telegramBotToken,
    discordBotToken: hands.discordBotToken,
    slackWebhookUrl: hands.slackWebhookUrl,
    slackSigningSecret: hands.slackSigningSecret,
    homeAssistantUrl: hands.homeAssistantUrl,
    homeAssistantToken: hands.homeAssistantToken,
    tools: hands.tools,
    mcpServerCommand: hands.mcpServerCommand,
    acpServerCommand: hands.acpServerCommand,
    falApiKey: hands.falApiKey,
    e2bApiKey: hands.e2bApiKey,
    githubToken: hands.githubToken,
  });
}

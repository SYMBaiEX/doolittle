import { displayCommand } from "@/runtime/commands/command-execution";
import {
  getLinkedProviderConnectAdvice,
  getLinkedProviderLoginCommand,
  getLinkedProviderSetupCommand,
} from "@/runtime/native/account-auth";
import type { AccountsCommandHooks } from "./types";

export async function handleAccountLogin(
  provider: "elizacloud" | "codex" | "claude-code",
  hooks: AccountsCommandHooks,
): Promise<string> {
  if (hooks?.runLocalShellCommand) {
    return hooks.runLocalShellCommand({
      command: getLinkedProviderLoginCommand(provider),
      afterSuccessConnectProvider: provider,
    });
  }

  const advice = getLinkedProviderConnectAdvice(provider);
  const loginCommand = getLinkedProviderLoginCommand(provider);
  const setupCommand = getLinkedProviderSetupCommand(provider);
  return [
    provider === "elizacloud"
      ? "To activate Eliza Cloud managed mode, run this in your local shell:"
      : `To bind ${provider} as a local specialist provider, run this in your local shell:`,
    `  ${loginCommand}`,
    `If you're already inside the Doolittle shell or cockpit, you can also run: !${loginCommand}`,
    setupCommand ? `Optional setup-token path: ${setupCommand}` : "",
    `After that, run ${displayCommand(`/accounts connect ${provider}`)} here.`,
    "",
    `detail: ${advice.detail}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function handleClaudeSetupToken(
  hooks: AccountsCommandHooks,
): Promise<string> {
  const provider = "claude-code";
  const setupCommand = getLinkedProviderSetupCommand(provider);
  if (!setupCommand) {
    return `No setup-token flow is available for ${provider}.`;
  }

  if (hooks?.runLocalShellCommand) {
    return hooks.runLocalShellCommand({
      command: setupCommand,
      afterSuccessConnectProvider: provider,
    });
  }

  const advice = getLinkedProviderConnectAdvice(provider);
  return [
    "To bind Claude Code natively with a setup token, run this in your local shell:",
    `  ${setupCommand}`,
    `From the Doolittle shell or cockpit, you can also run: !${setupCommand}`,
    "Then paste the token into onboarding or set CLAUDE_CODE_SETUP_TOKEN / CLAUDE_CODE_OAUTH_TOKEN.",
    `After that, run ${displayCommand("/accounts connect claude-code")} here.`,
    "",
    `detail: ${advice.detail}`,
  ].join("\n");
}

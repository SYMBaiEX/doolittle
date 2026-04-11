import {
  getLinkedProviderAccountsSnapshot,
  type LinkedProviderAccountsSnapshot,
} from "../../../../../packages/agent/src/runtime/native/account-auth/index";
import type { BootstrapWizardContext } from "../../../bootstrap-context";
import { askSecret, askYesNo, chooseOne } from "../../../core/prompt-ops";
import type { PromptHandle } from "../../../core/prompts";
import { runInteractiveCommand } from "../../shell";
import { resolveClaudeCodeBondDefault } from "./claude-code-defaults";
import type { ProviderSelectionState } from "./state";

export async function runClaudeCodeProviderBranch(args: {
  context: BootstrapWizardContext;
  rl: PromptHandle;
  linkedAccounts: LinkedProviderAccountsSnapshot;
  state: ProviderSelectionState;
}): Promise<LinkedProviderAccountsSnapshot> {
  const { context, rl, linkedAccounts: inputLinkedAccounts, state } = args;
  let linkedAccounts = inputLinkedAccounts;
  if (state.provider !== "claude-code") {
    return linkedAccounts;
  }

  if (linkedAccounts.claudeCode.nativeReady && state.useLinkedClaudeCodeAuth) {
    context.section(
      "Claude Bond",
      "Claude Code is already bound with native credentials. I can keep that path and move on.",
    );
    context.info(
      "Detected reusable native Claude Code auth. No extra binding step needed.",
    );
    return linkedAccounts;
  }

  context.section(
    "Claude Bond",
    "Choose how I should bind to Claude Code. Native auth comes first; local CLI fallback is only the escape hatch.",
  );
  const claudePath = await chooseOne<
    "login" | "setup-token" | "local-cli-fallback" | "skip"
  >(
    context,
    rl,
    "How should I complete the Claude bond?",
    [
      {
        value: "login",
        label: "Claude auth login",
        detail:
          "Recommended first step. Use the official Claude Code login flow and then let me detect native credentials.",
      },
      {
        value: "setup-token",
        label: "Claude setup-token",
        detail:
          "Best native path for Eliza-owned execution. Generate a Claude token and bind it directly into my runtime.",
      },
      {
        value: "local-cli-fallback",
        label: "Use local Claude session",
        detail:
          "Only choose this if you do not want native auth material. I will call the local Claude CLI as a fallback.",
      },
      {
        value: "skip",
        label: "Skip for now",
        detail: "Leave Claude unbound for now.",
      },
    ],
    resolveClaudeCodeBondDefault(state),
  );

  if (claudePath === "login") {
    runInteractiveCommand(
      context,
      "claude",
      ["auth", "login"],
      "Claude auth login",
    );
    linkedAccounts = {
      ...getLinkedProviderAccountsSnapshot(),
    };
    state.useLinkedClaudeCodeAuth = linkedAccounts.claudeCode.reusable;
    if (!linkedAccounts.claudeCode.reusable) {
      const continueNative = await askYesNo(
        context,
        rl,
        "Claude is logged in, but I still do not have native auth material. Should I run `claude setup-token` now so Eliza can own the session cleanly",
        true,
      );
      if (continueNative) {
        runInteractiveCommand(
          context,
          "claude",
          ["setup-token"],
          "Claude setup-token",
        );
        state.claudeCodeOauthToken = await askSecret(
          context,
          rl,
          "Paste the Claude setup token I should bind",
          state.claudeCodeOauthToken,
        );
        state.useLinkedClaudeCodeAuth = Boolean(
          state.claudeCodeOauthToken.trim(),
        );
      } else {
        state.claudeCodeCliFallback = await askYesNo(
          context,
          rl,
          "Should I use the local signed-in Claude CLI as a fallback instead",
          false,
        );
        state.useLinkedClaudeCodeAuth = state.claudeCodeCliFallback;
      }
    }
  } else if (claudePath === "setup-token") {
    runInteractiveCommand(
      context,
      "claude",
      ["setup-token"],
      "Claude setup-token",
    );
    state.claudeCodeOauthToken = await askSecret(
      context,
      rl,
      "Paste the Claude setup token I should bind",
      state.claudeCodeOauthToken,
    );
    state.useLinkedClaudeCodeAuth = Boolean(state.claudeCodeOauthToken.trim());
  } else if (claudePath === "local-cli-fallback") {
    state.claudeCodeCliFallback = true;
    state.useLinkedClaudeCodeAuth = true;
  }

  return linkedAccounts;
}

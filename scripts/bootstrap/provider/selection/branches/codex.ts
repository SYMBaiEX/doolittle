import {
  getLinkedProviderAccountsSnapshot,
  type LinkedProviderAccountsSnapshot,
} from "../../../../../packages/agent/src/runtime/native/account-auth/index";
import type { BootstrapWizardContext } from "../../../bootstrap-context";
import { askYesNo, chooseOne } from "../../../core/prompt-ops";
import type { PromptHandle } from "../../../core/prompts";
import { runInteractiveCommand } from "../../shell";
import { resolveCodexBondDefault } from "./codex-defaults";
import type { ProviderSelectionState } from "./state";

export async function runCodexProviderBranch(args: {
  context: BootstrapWizardContext;
  rl: PromptHandle;
  linkedAccounts: LinkedProviderAccountsSnapshot;
  state: ProviderSelectionState;
}): Promise<LinkedProviderAccountsSnapshot> {
  const { context, rl, linkedAccounts: inputLinkedAccounts, state } = args;
  let linkedAccounts = inputLinkedAccounts;
  if (state.provider !== "codex") {
    return linkedAccounts;
  }

  if (linkedAccounts.codex.nativeReady && state.useLinkedCodexAuth) {
    context.section(
      "Codex Bond",
      "Codex is already bound cleanly on this machine. I can keep that path and move on.",
    );
    context.info(
      "Detected reusable native Codex auth. No extra login step needed.",
    );
    return linkedAccounts;
  }

  context.section(
    "Codex Bond",
    "Choose how I should bind to Codex. Native auth is the path I want by default.",
  );
  const codexPath = await chooseOne<"login" | "skip">(
    context,
    rl,
    "How should I complete the Codex bond?",
    [
      {
        value: "login",
        label: "Codex login",
        detail:
          "Recommended first step. Use the official Codex login flow and let me detect the reusable auth store.",
      },
      {
        value: "skip",
        label: "Skip for now",
        detail:
          "Leave Codex unbound for now and continue with another provider.",
      },
    ],
    resolveCodexBondDefault(linkedAccounts),
  );

  if (codexPath === "login") {
    runInteractiveCommand(context, "codex", ["login"], "Codex login");
    linkedAccounts = {
      ...getLinkedProviderAccountsSnapshot(),
    };
    state.useLinkedCodexAuth = Boolean(linkedAccounts.codex.nativeReady);
    if (!linkedAccounts.codex.nativeReady) {
      context.warn(
        "Codex login completed, but I still cannot see reusable native auth material yet.",
      );
      const keepCodex = await askYesNo(
        context,
        rl,
        "Should I keep Codex selected anyway and let you reconnect it later from `/accounts-connect codex`",
        false,
      );
      if (!keepCodex) {
        state.provider = "openai";
        state.useLinkedCodexAuth = false;
      }
    } else {
      state.useLinkedCodexAuth = true;
    }
  } else if (!linkedAccounts.codex.nativeReady) {
    const switchProvider = await askYesNo(
      context,
      rl,
      "Codex is not bound yet. Should I switch to OpenAI so I can finish this first boot with a working provider",
      true,
    );
    if (switchProvider) {
      state.provider = "openai";
      state.useLinkedCodexAuth = false;
    }
  }

  return linkedAccounts;
}

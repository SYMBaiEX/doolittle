import {
  getLinkedProviderAccountsSnapshot,
  type LinkedProviderAccountsSnapshot,
} from "@doolittle/agent/runtime/native/account-auth";
import type { BootstrapWizardContext } from "../../../bootstrap-context";
import { askYesNo, chooseOne } from "../../../core/prompt-ops";
import type { PromptHandle } from "../../../prompting/types";
import { runInteractiveCommand } from "../../shell";
import type { ProviderSelectionState } from "./state";

export async function runDevinProviderBranch(args: {
  context: BootstrapWizardContext;
  rl: PromptHandle;
  linkedAccounts: LinkedProviderAccountsSnapshot;
  state: ProviderSelectionState;
}): Promise<LinkedProviderAccountsSnapshot> {
  const { context, rl, linkedAccounts: inputLinkedAccounts, state } = args;
  let linkedAccounts = inputLinkedAccounts;
  if (state.provider !== "devin") {
    return linkedAccounts;
  }

  if (
    (linkedAccounts.devin?.nativeReady || linkedAccounts.devin?.reusable) &&
    state.useLinkedDevinAuth
  ) {
    context.section(
      "Devin Bond",
      "Devin is already signed in locally. I can keep SWE model execution as the default path.",
    );
    context.info(
      "Detected reusable Devin CLI auth. No extra login step needed.",
    );
    return linkedAccounts;
  }

  context.section(
    "Devin Bond",
    "Choose how I should bind to Devin. Local CLI auth is the supported path for SWE model execution.",
  );
  const devinPath = await chooseOne<"login" | "skip">(
    context,
    rl,
    "How should I complete the Devin bond?",
    [
      {
        value: "login",
        label: "Devin auth login",
        detail:
          "Use the official Devin login flow and let me detect the reusable local CLI session.",
      },
      {
        value: "skip",
        label: "Skip for now",
        detail:
          "Leave Devin unbound for now and continue with another provider.",
      },
    ],
    linkedAccounts.devin?.available ? "login" : "skip",
  );

  if (devinPath === "login") {
    runInteractiveCommand(context, "devin", ["auth", "login"], "Devin login");
    linkedAccounts = {
      ...getLinkedProviderAccountsSnapshot(),
    };
    state.useLinkedDevinAuth = Boolean(
      linkedAccounts.devin?.nativeReady || linkedAccounts.devin?.reusable,
    );
    if (!state.useLinkedDevinAuth) {
      context.warn(
        "Devin login completed, but I still cannot see a reusable local CLI session yet.",
      );
      const keepDevin = await askYesNo(
        context,
        rl,
        "Should I keep Devin selected anyway and let you reconnect it later from `/accounts connect devin`",
        true,
      );
      if (!keepDevin) {
        state.provider = "ollama";
      }
    }
  } else if (
    !(linkedAccounts.devin?.nativeReady || linkedAccounts.devin?.reusable)
  ) {
    const switchProvider = await askYesNo(
      context,
      rl,
      "Devin is not bound yet. Should I switch to Ollama so I can finish first boot with a working local provider",
      true,
    );
    if (switchProvider) {
      state.provider = "ollama";
      state.useLinkedDevinAuth = false;
    }
  }

  return linkedAccounts;
}

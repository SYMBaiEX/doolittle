import type { LinkedProviderAccountsSnapshot } from "@/runtime/native/account-auth";
import type { BootstrapWizardContext } from "../../../bootstrap-context";
import { ask, askSecret, chooseOne } from "../../../core/prompt-ops";
import type { PromptHandle } from "../../../prompting/types";
import { runElizaCloudLoginFlow } from "../../cloud-login";
import {
  buildCloudRecoveryOptions,
  type CloudRecoveryChoice,
} from "../../recovery";
import type { ProviderSelectionState } from "./state";

async function askElizaCloudModels(
  context: BootstrapWizardContext,
  rl: PromptHandle,
  state: ProviderSelectionState,
): Promise<void> {
  state.elizaCloudSmallModel = await ask(
    context,
    rl,
    "Choose my fast Eliza Cloud model",
    state.elizaCloudSmallModel,
  );
  state.elizaCloudModel = await ask(
    context,
    rl,
    "Choose my deep Eliza Cloud model",
    state.elizaCloudModel,
  );
  state.elizaCloudEmbeddingModel = await ask(
    context,
    rl,
    "Choose my Eliza Cloud embedding model",
    state.elizaCloudEmbeddingModel,
  );
}

export async function runElizaCloudProviderBranch(args: {
  context: BootstrapWizardContext;
  rl: PromptHandle;
  existingEnv: Map<string, string>;
  linkedAccounts: LinkedProviderAccountsSnapshot;
  state: ProviderSelectionState;
}): Promise<LinkedProviderAccountsSnapshot> {
  const { context, rl, existingEnv, linkedAccounts, state } = args;
  if (state.provider !== "elizacloud") {
    return linkedAccounts;
  }

  if (state.elizaCloudApiKey) {
    context.section(
      "Cloud Bond",
      existingEnv.get("ELIZAOS_CLOUD_ENABLED") === "true"
        ? "Eliza Cloud is already active for this workspace, so I can keep the managed path and move on."
        : "Eliza Cloud is already connected for this workspace, so I can activate the managed path without asking for the key again.",
    );
    context.info(
      existingEnv.get("ELIZAOS_CLOUD_ENABLED") === "true"
        ? "Detected an active Eliza Cloud bond locally."
        : "Detected ELIZAOS_CLOUD_API_KEY locally. I can turn Eliza Cloud into the active managed inference path now.",
    );
    state.elizaCloudEnabled = true;
    await askElizaCloudModels(context, rl, state);
    return linkedAccounts;
  }

  context.section(
    "Cloud Bond",
    "Eliza Cloud is the cleanest managed path here. I can bond to it with the official Eliza login flow or a direct cloud key.",
  );
  const cloudPath = await chooseOne<"login" | "key" | "skip">(
    context,
    rl,
    "How should I complete the Eliza Cloud bond?",
    [
      {
        value: "login",
        label: "Eliza Cloud login",
        detail:
          "Recommended. Use `elizaos login` and let it write ELIZAOS_CLOUD_API_KEY into this project automatically.",
      },
      {
        value: "key",
        label: "Paste cloud key",
        detail:
          "Use an existing Eliza Cloud API key directly if you already have one from the dashboard.",
      },
      {
        value: "skip",
        label: "Skip for now",
        detail:
          "Leave managed cloud inference unbound for now and choose another provider later.",
      },
    ],
    "login",
  );

  if (cloudPath === "login") {
    const apiKey = await runElizaCloudLoginFlow(context, "Eliza Cloud login");
    if (apiKey) {
      state.elizaCloudApiKey = apiKey;
      state.elizaCloudEnabled = true;
      await askElizaCloudModels(context, rl, state);
    }
  } else if (cloudPath === "key") {
    state.elizaCloudApiKey = await askSecret(
      context,
      rl,
      "Give me ELIZAOS_CLOUD_API_KEY",
      state.elizaCloudApiKey,
    );
    state.elizaCloudEnabled = Boolean(state.elizaCloudApiKey);
    if (state.elizaCloudApiKey) {
      await askElizaCloudModels(context, rl, state);
    }
  }

  if (state.elizaCloudApiKey) {
    return linkedAccounts;
  }

  if (cloudPath !== "skip") {
    context.warn(
      "I still do not see ELIZAOS_CLOUD_API_KEY in this workspace, so Eliza Cloud is not fully bonded yet.",
    );
    const recovery = await chooseOne<CloudRecoveryChoice>(
      context,
      rl,
      "How should I recover from the incomplete Eliza Cloud bond?",
      buildCloudRecoveryOptions(
        linkedAccounts,
        state.openaiApiKey,
        state.anthropicApiKey,
      ),
      "retry",
    );

    if (recovery === "retry") {
      const retryKey = await runElizaCloudLoginFlow(
        context,
        "Eliza Cloud login",
      );
      if (retryKey) {
        state.elizaCloudApiKey = retryKey;
        state.elizaCloudEnabled = true;
        await askElizaCloudModels(context, rl, state);
      } else {
        state.provider = "offline";
      }
    } else if (recovery === "key") {
      state.elizaCloudApiKey = await askSecret(
        context,
        rl,
        "Give me ELIZAOS_CLOUD_API_KEY",
        state.elizaCloudApiKey,
      );
      state.elizaCloudEnabled = Boolean(state.elizaCloudApiKey);
      if (state.elizaCloudApiKey) {
        await askElizaCloudModels(context, rl, state);
      } else {
        state.provider = "offline";
      }
    } else if (recovery === "codex") {
      state.provider = "codex";
      state.useLinkedCodexAuth = true;
    } else if (recovery === "claude-code") {
      state.provider = "claude-code";
      state.useLinkedClaudeCodeAuth = true;
    } else if (recovery === "openai") {
      state.provider = "openai";
    } else if (recovery === "anthropic") {
      state.provider = "anthropic";
    } else {
      state.provider = "offline";
    }
  }

  return linkedAccounts;
}

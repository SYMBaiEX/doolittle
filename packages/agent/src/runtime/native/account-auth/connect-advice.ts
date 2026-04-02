import type {
  LinkedProviderAccountStatus,
  LinkedProviderConnectAdvice,
  LinkedProviderName,
} from "./types";

export function getLinkedProviderLoginCommand(
  provider: LinkedProviderName,
): string {
  if (provider === "codex") {
    return "codex login";
  }
  if (provider === "elizacloud") {
    return "elizaos login";
  }
  return "claude auth login";
}

export function getLinkedProviderSetupCommand(
  provider: LinkedProviderName,
): string | undefined {
  return provider === "claude-code" ? "claude setup-token" : undefined;
}

export function buildLinkedProviderConnectAdvice(
  provider: LinkedProviderName,
  status: LinkedProviderAccountStatus,
): LinkedProviderConnectAdvice {
  const nativeReady = status.nativeReady ?? status.reusable;
  const fallbackReady = status.fallbackReady ?? false;

  if (nativeReady) {
    return {
      provider,
      status,
      ready: true,
      preferredAction: "use",
      primaryCommand: `/accounts connect ${provider}`,
      detail:
        provider === "codex"
          ? "Codex is already bound for native Eliza execution. Run `/accounts connect codex` to activate it here."
          : provider === "elizacloud"
            ? "Eliza Cloud is already available in this workspace. Run `/accounts connect elizacloud` to activate managed cloud inference here."
            : "Claude Code is already bound for native Eliza execution. Run `/accounts connect claude-code` to activate it here.",
    };
  }

  if (provider === "claude-code" && fallbackReady) {
    return {
      provider,
      status,
      ready: false,
      preferredAction: "setup-token",
      primaryCommand: status.setupCommand,
      secondaryCommand: `/accounts connect ${provider}`,
      detail:
        "Claude Code is signed in locally, but native Eliza auth material is still missing. Run `claude setup-token` to complete the native path, or run `/accounts connect claude-code` to use the local CLI fallback now.",
    };
  }

  return {
    provider,
    status,
    ready: false,
    preferredAction: "login",
    primaryCommand: status.loginCommand,
    secondaryCommand: `/accounts connect ${provider}`,
    detail:
      provider === "codex"
        ? "Codex still needs a linked local login. Run `codex login`, then `/accounts connect codex` to bind it in Eliza."
        : provider === "elizacloud"
          ? "Eliza Cloud is not active yet. Run `elizaos login` from this project to save ELIZAOS_CLOUD_API_KEY, then `/accounts connect elizacloud` to use the managed cloud path."
          : "Claude Code still needs an official login. Run `claude auth login`, then `/accounts connect claude-code` to bind it in Eliza.",
  };
}

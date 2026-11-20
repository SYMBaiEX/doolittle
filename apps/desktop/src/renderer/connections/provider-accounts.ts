import type { LinkedProviderAccountsLike } from "../model-routing";

export const accountProviders = [
  {
    key: "elizacloud",
    snapshot: "elizaCloud",
    poolProvider: undefined,
    label: "Eliza Cloud",
    shortLabel: "EC",
    accountSignIn: false,
  },
  {
    key: "codex",
    snapshot: "codex",
    poolProvider: "openai-codex",
    label: "Codex",
    shortLabel: "CX",
    accountSignIn: true,
  },
  {
    key: "claude-code",
    snapshot: "claudeCode",
    poolProvider: "anthropic-subscription",
    label: "Claude Code",
    shortLabel: "CC",
    accountSignIn: true,
  },
] as const;

export interface AccountsResponse {
  activeProvider?: string;
  accounts?: LinkedProviderAccountsLike;
}

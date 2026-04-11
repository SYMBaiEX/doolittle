export interface BootstrapDependencyProbeSummary {
  label: string;
  installed: boolean;
}

export interface BootstrapOnboardingSummary {
  mode: string;
  theme: string;
  provider: string;
  backend: string;
  agent: {
    runDepth: string;
    maxIterations: number;
    toolProgressMode: string;
  };
  nativeOnboarding: {
    complete: boolean;
    currentStep: string;
  };
  nativeConnection: {
    kind: string;
    provider: string | null;
  };
  accounts: {
    codexLinked: boolean;
    claudeCodeLinked: boolean;
  };
  transports: string[];
  profile: string;
}

export interface BootstrapSummarySection {
  title: string;
  lines: string[];
}

export interface BootstrapPulseSummary {
  statusLines: string[];
  sections: BootstrapSummarySection[];
}

export function buildBootstrapCheckSummary(args: {
  createdDirs: string[];
  dependencyProbes: BootstrapDependencyProbeSummary[];
  envMessages: string[];
}): string {
  return [
    "Doolittle bootstrap",
    "mode: check",
    "",
    "Directories:",
    ...args.createdDirs.map((entry) => `- ${entry}`),
    "",
    "Preflight:",
    ...args.dependencyProbes.map(
      (probe) => `- ${probe.label}: ${probe.installed ? "online" : "missing"}`,
    ),
    "",
    "Environment:",
    ...args.envMessages.map((entry) => `- ${entry}`),
    "",
    "Bootstrap check complete.",
  ].join("\n");
}

export function buildBootstrapPulseSummary(args: {
  checkOnly: boolean;
  themeLabel: string;
  onboarding: BootstrapOnboardingSummary;
  createdDirs: string[];
  envMessages: string[];
}): BootstrapPulseSummary {
  const { onboarding } = args;
  return {
    statusLines: [
      `state: ${args.checkOnly ? "check" : "awake"}`,
      `awakening: ${onboarding.mode}`,
      `mind: ${onboarding.provider}`,
      `skin: ${args.themeLabel} (${onboarding.theme})`,
      `body: ${onboarding.backend}`,
      `cadence: ${onboarding.agent.runDepth} cap=${onboarding.agent.maxIterations} progress=${onboarding.agent.toolProgressMode}`,
      `onboarding: ${onboarding.nativeOnboarding.complete ? "native-aligned" : "mirror-warn"} (${onboarding.nativeOnboarding.currentStep})`,
      `native connection: ${onboarding.nativeConnection.kind}${onboarding.nativeConnection.provider ? ` via ${onboarding.nativeConnection.provider}` : ""}`,
      `threads: codex=${onboarding.accounts.codexLinked ? "bound" : "idle"} claude=${onboarding.accounts.claudeCodeLinked ? "bound" : "idle"}`,
      `channels: ${onboarding.transports.join(", ") || "api, cli only"}`,
      `pulseprint: ${onboarding.profile}`,
    ],
    sections: [
      {
        title: "What I Wrote",
        lines: args.createdDirs.map((entry) => `- ${entry}`),
      },
      {
        title: "Runtime Bindings",
        lines: args.envMessages.map((entry) => `- ${entry}`),
      },
      {
        title: "Next Moves",
        lines: [
          "- bun run start",
          "- bun run start cockpit",
          "- bun run dev",
          "- bun run bootstrap --check",
          "- /theme list",
          "- /doctor",
          "- /gateway readiness",
        ],
      },
      {
        title: "First Words",
        lines: [
          '- "summarize this repo and tell me where to start"',
          "- !git status",
          '- "what machine am I on and what tools can you use here"',
        ],
      },
    ],
  };
}

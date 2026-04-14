import type { OperatorReadinessSummary, SetupSummary } from "../service/types";
import type { OperatorCondensedSummary } from "../summary";

function uniqueSteps(steps: Array<string | undefined>): string[] {
  return [...new Set(steps.filter((step): step is string => Boolean(step)))];
}

export function buildSetupReadinessSummary(input: {
  directories: SetupSummary["directories"];
  providers: SetupSummary["providers"];
  transports: SetupSummary["transports"];
  condensed: OperatorCondensedSummary;
}): OperatorReadinessSummary {
  const missingDirectories = input.directories.filter((entry) => !entry.exists);
  const readyProviders = input.providers.filter((entry) => entry.ready);
  const readyTransports = input.transports.filter((entry) => entry.ready);
  const compatibilityFailures = input.condensed.ecosystem.compatibilityFailures;
  const failedWorkflows = input.condensed.pipeline?.failedWorkflows ?? 0;

  const level =
    missingDirectories.length > 0 || readyProviders.length === 0
      ? "blocked"
      : compatibilityFailures > 0 ||
          failedWorkflows > 0 ||
          readyTransports.length === 0
        ? "needs-attention"
        : "ready";

  const headline =
    level === "blocked"
      ? missingDirectories.length > 0
        ? "Core runtime directories are incomplete and setup needs repair."
        : "The shell is up, but no primary model provider is ready yet."
      : level === "needs-attention"
        ? "The shell is usable, but some runtime surfaces still need attention."
        : "The shell, providers, and core runtime surfaces look ready.";

  const detail = [
    `providers ${readyProviders.length}/${input.providers.length} ready`,
    `transports ${readyTransports.length}/${input.transports.length} ready`,
    `compatibility failures ${compatibilityFailures}`,
    `failed workflows ${failedWorkflows}`,
  ].join(" · ");

  return {
    level,
    headline,
    detail,
    nextSteps: uniqueSteps([
      missingDirectories.length > 0
        ? "Run `doolittle setup` to recreate missing runtime directories before relying on automation."
        : undefined,
      readyProviders.length === 0
        ? "Link a primary provider in `doolittle setup` or supply OPENAI/Anthropic credentials before starting agent turns."
        : undefined,
      readyTransports.length === 0
        ? "If you want gateway continuity, enable at least one transport and confirm `/gateway status`."
        : undefined,
      compatibilityFailures > 0
        ? "Review compatibility failures before treating registry and skill surfaces as production-ready."
        : undefined,
      failedWorkflows > 0
        ? "Inspect failed autocoder workflows before trusting generated mutations."
        : undefined,
      level === "ready"
        ? "Keep `/doctor` and `bun run check` as the standard validation loop after configuration changes."
        : undefined,
    ]),
  };
}

export function buildUpdateReadinessSummary(input: {
  repositoryAvailable: boolean;
  repositoryStatus: string;
  condensed: OperatorCondensedSummary;
}): OperatorReadinessSummary {
  const compatibilityFailures = input.condensed.ecosystem.compatibilityFailures;
  const failedWorkflows = input.condensed.pipeline?.failedWorkflows ?? 0;
  const repositoryDirty =
    input.repositoryAvailable &&
    input.repositoryStatus.trim() !== "" &&
    input.repositoryStatus.trim() !== "clean";

  const level = !input.repositoryAvailable
    ? "needs-attention"
    : compatibilityFailures > 0 || failedWorkflows > 0 || repositoryDirty
      ? "needs-attention"
      : "ready";

  const headline = !input.repositoryAvailable
    ? "Update preview is limited because this workspace is not a git repository."
    : level === "needs-attention"
      ? "Update planning is available, but the runtime still has follow-up work before a clean release loop."
      : "Update planning looks healthy from both repository and runtime signals.";

  const detail = [
    input.repositoryAvailable ? "git repository detected" : "no git repository",
    repositoryDirty ? "workspace has pending changes" : "workspace is clean",
    `compatibility failures ${compatibilityFailures}`,
    `failed workflows ${failedWorkflows}`,
  ].join(" · ");

  return {
    level,
    headline,
    detail,
    nextSteps: uniqueSteps([
      !input.repositoryAvailable
        ? "Initialize or open the workspace inside git if you want update previews tied to commit history."
        : undefined,
      repositoryDirty
        ? "Review git status before updating runtime dependencies or publishing package changes."
        : undefined,
      compatibilityFailures > 0
        ? "Resolve compatibility failures before packaging or distributing runtime surfaces."
        : undefined,
      failedWorkflows > 0
        ? "Review failed autocoder workflows before advertising those paths as healthy."
        : undefined,
      level === "ready"
        ? "Run `bun install`, `bun run typecheck`, `bun test`, and `bun run build` after dependency changes."
        : undefined,
    ]),
  };
}

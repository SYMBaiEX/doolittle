import { buildOperatorCondensedSummary } from "../summary";
import { resolveOwnership } from "./ownership";
import { buildUpdateReadinessSummary } from "./readiness";
import type {
  OperatorRuntimeSummaryDependencies,
  OperatorUpdatePreview,
} from "./types";

export async function buildOperatorUpdatePreview(
  dependencies: OperatorRuntimeSummaryDependencies,
): Promise<OperatorUpdatePreview> {
  const ecosystem = dependencies.agentSdk
    ? await dependencies.agentSdk.overview()
    : undefined;
  const repositoryAvailable = dependencies.repository.isRepository();
  const repositoryStatus = repositoryAvailable
    ? await dependencies.repository.status()
    : "(workspace is not inside a git repository)";
  const recentCommits = repositoryAvailable
    ? await dependencies.repository.recentCommits(8)
    : "(no git history available)";
  const ownership = resolveOwnership(dependencies);
  const transportControl = ownership?.transportControl;
  const pipeline = dependencies.autocoderPipeline?.summary();
  const workspaceEcosystem = dependencies.ecosystemService?.summary();
  const condensed = buildOperatorCondensedSummary({
    ownership,
    ecosystem,
    workspaceEcosystem,
    pipeline,
  });
  const readiness = buildUpdateReadinessSummary({
    repositoryAvailable,
    repositoryStatus,
    condensed,
  });

  return {
    readiness,
    version: dependencies.version(),
    repositoryAvailable,
    repositoryStatus,
    recentCommits,
    transportControl: transportControl?.totals,
    transportInventory: transportControl?.transportInventory,
    ownership: condensed.ownership,
    recommendedSteps: repositoryAvailable
      ? [
          "Review git status before updating runtime dependencies.",
          "Run bun install after dependency changes.",
          "Re-run bun run typecheck, bun test, and bun run build after updating.",
        ]
      : [
          "Initialize a git repository if you want update previews tied to commit history.",
          "Keep bun install, bun run typecheck, bun test, and bun run build as the standard update validation flow.",
        ],
    ecosystem: condensed.ecosystem,
    pluginManager: condensed.pluginManager,
    pipeline: condensed.pipeline,
  };
}
